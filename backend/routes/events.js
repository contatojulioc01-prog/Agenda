const express = require('express');
const router = express.Router();
const db = require('../db');
const asyncRoute = require('../async-route');
const { validateEventInput } = require('../validation');

function genId() {
  return 'evt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function hasAccess(calendarId, userId, requireWrite = false) {
  if (!calendarId) return true;
  const calendar = await db.get('SELECT * FROM calendars WHERE id = ?', [calendarId]);
  if (!calendar) return false;
  if (requireWrite && (calendar.is_task_calendar || await db.get('SELECT 1 FROM kanban_teams WHERE calendar_id = ?', [calendarId]))) return false;
  if (calendar.owner_id === userId) return true;
  if (!userId) return false;

  const member = await db.get('SELECT permission FROM calendar_members WHERE calendar_id = ? AND user_id = ?', [calendarId, String(userId)]);
  if (!member) return false;
  return !requireWrite || ['owner', 'editor'].includes(member.permission);
}

async function isTaskDeadlineEvent(eventId) {
  return !!(await db.get('SELECT 1 FROM kanban_task_events WHERE event_id = ?', [eventId]));
}

function eventDto(event) {
  let dayTimes = {};
  try { dayTimes = JSON.parse(event.day_times || '{}'); } catch {}
  return {
    ...event,
    calendarId: event.calendar_id,
    endDate: event.end_date || event.date,
    startTime: event.start_time,
    endTime: event.end_time,
    dayTimes,
    copyGroupId: event.copy_group_id || event.id,
    allDay: event.all_day === 1,
    isSystem: event.is_task_deadline === 1,
    isTaskDeadline: event.is_task_deadline === 1,
    taskId: event.task_id || undefined,
    taskBoardId: event.task_board_id || undefined,
    taskParentId: event.task_parent_id || undefined,
  };
}

router.get('/:calendarId/events', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { calendarId } = req.params;
  if (!(await hasAccess(calendarId, userId))) return res.status(403).json({ error: 'Sem acesso' });
  const events = await db.all(`SELECT e.*,
    CASE WHEN kte.event_id IS NOT NULL THEN 1 ELSE 0 END AS is_task_deadline,
    kte.task_id, kt.board_id AS task_board_id, kt.parent_task_id AS task_parent_id
    FROM events e
    LEFT JOIN kanban_task_events kte ON kte.event_id = e.id
    LEFT JOIN kanban_tasks kt ON kt.id = kte.task_id
    WHERE e.calendar_id = ?
    ORDER BY e.date ASC, e.start_time ASC`, [calendarId]);
  res.json(events.map(eventDto));
}));

router.post('/:calendarId/events', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { calendarId } = req.params;
  if (!(await hasAccess(calendarId, userId, true))) return res.status(403).json({ error: 'Sem permissão para criar eventos' });

  const { title, description = '', date, endDate, startTime = '09:00', endTime = '10:00', dayTimes = {}, color = 'indigo', category = 'Geral', allDay = false, copyGroupId } = req.body;
  const validationError = validateEventInput({ title, description, date, endDate: endDate || date, startTime, endTime, dayTimes, color, category, allDay });
  if (validationError) return res.status(400).json({ error: validationError });

  const id = genId();
  const now = new Date().toISOString();
  await db.run(`INSERT INTO events (id, calendar_id, title, description, date, end_date, start_time, end_time,
    day_times, color, category, all_day, created_by, copy_group_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, calendarId, title.trim(), description, date, endDate || date, startTime, endTime, JSON.stringify(dayTimes || {}), color, category, allDay ? 1 : 0, userId, copyGroupId || id, now]);

  const event = await db.get('SELECT * FROM events WHERE id = ?', [id]);
  req.broadcast({ type: 'event_created', calendarId, eventId: id });
  res.status(201).json(eventDto(event));
}));

router.put('/:id', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const event = await db.get('SELECT * FROM events WHERE id = ?', [id]);
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
  if (!(await hasAccess(event.calendar_id, userId, true))) return res.status(403).json({ error: 'Sem permissão' });
  if (await isTaskDeadlineEvent(id)) return res.status(409).json({ error: 'O prazo desta tarefa deve ser alterado pelo card no Kanban' });

  const { title, description, date, endDate, startTime, endTime, dayTimes, color, category, allDay } = req.body;
  const validationError = validateEventInput({ ...eventDto(event), ...req.body });
  if (validationError) return res.status(400).json({ error: validationError });
  const now = new Date().toISOString();
  if (title !== undefined) await db.run('UPDATE events SET title = ?, updated_at = ? WHERE id = ?', [title.trim(), now, id]);
  if (description !== undefined) await db.run('UPDATE events SET description = ?, updated_at = ? WHERE id = ?', [description, now, id]);
  if (date) await db.run('UPDATE events SET date = ?, updated_at = ? WHERE id = ?', [date, now, id]);
  if (endDate !== undefined) await db.run('UPDATE events SET end_date = ?, updated_at = ? WHERE id = ?', [endDate, now, id]);
  if (startTime) await db.run('UPDATE events SET start_time = ?, updated_at = ? WHERE id = ?', [startTime, now, id]);
  if (endTime) await db.run('UPDATE events SET end_time = ?, updated_at = ? WHERE id = ?', [endTime, now, id]);
  if (dayTimes !== undefined) await db.run('UPDATE events SET day_times = ?, updated_at = ? WHERE id = ?', [JSON.stringify(dayTimes), now, id]);
  if (color) await db.run('UPDATE events SET color = ?, updated_at = ? WHERE id = ?', [color, now, id]);
  if (category) await db.run('UPDATE events SET category = ?, updated_at = ? WHERE id = ?', [category, now, id]);
  if (allDay !== undefined) await db.run('UPDATE events SET all_day = ?, updated_at = ? WHERE id = ?', [allDay ? 1 : 0, now, id]);

  const updated = await db.get('SELECT * FROM events WHERE id = ?', [id]);
  req.broadcast({ type: 'event_updated', calendarId: event.calendar_id, eventId: id });
  res.json(eventDto(updated));
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const event = await db.get('SELECT * FROM events WHERE id = ?', [id]);
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
  if (!(await hasAccess(event.calendar_id, userId, true))) return res.status(403).json({ error: 'Sem permissão' });
  if (await isTaskDeadlineEvent(id)) return res.status(409).json({ error: 'O prazo desta tarefa só pode ser removido pelo card no Kanban' });
  await db.run('DELETE FROM events WHERE id = ?', [id]);
  req.broadcast({ type: 'event_deleted', calendarId: event.calendar_id, eventId: id });
  res.json({ success: true });
}));

module.exports = router;
