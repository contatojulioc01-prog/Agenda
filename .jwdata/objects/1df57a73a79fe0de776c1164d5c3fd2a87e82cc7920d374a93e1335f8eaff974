const express = require('express');
const router = express.Router();
const db = require('../db');
const asyncRoute = require('../async-route');
const { validateEventInput } = require('../validation');
const { listAttachments } = require('./attachments');

// F-02 FIX: regex de sanitização para o campo category (allowlist de caracteres seguros)
const SAFE_CATEGORY_RE = /^[\w\sÀ-ú!@#(),.:\-]{1,60}$/u;

function genId() {
  return 'evt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function genAttendeeId() {
  return 'att-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function hasAccess(calendarId, userId, requireWrite = false) {
  if (!calendarId) return true;
  const calendar = await db.get('SELECT * FROM calendars WHERE id = $1', [calendarId]);
  if (!calendar) return false;
  if (requireWrite && (calendar.is_task_calendar || await db.get('SELECT 1 FROM kanban_teams WHERE calendar_id = $1', [calendarId]))) return false;
  if (calendar.owner_id === userId) return true;
  if (!userId) return false;

  const member = await db.get('SELECT permission FROM calendar_members WHERE calendar_id = $1 AND user_id = $2', [calendarId, String(userId)]);
  if (!member) return false;
  return !requireWrite || ['owner', 'editor'].includes(member.permission);
}

async function isTaskDeadlineEvent(eventId) {
  return !!(await db.get('SELECT 1 FROM kanban_task_events WHERE event_id = $1', [eventId]));
}

async function getAttendees(eventId) {
  return await db.all('SELECT id, event_id AS "eventId", user_id AS "userId", name, email, status, role FROM event_attendees WHERE event_id = $1 ORDER BY created_at ASC', [eventId]);
}

function eventDto(event, attachments = [], attendees = []) {
  let dayTimes = {};
  try { dayTimes = JSON.parse(event.day_times || '{}'); } catch {}
  let recurrenceRule = null;
  try { if (event.recurrence_rule) recurrenceRule = JSON.parse(event.recurrence_rule); } catch {}
  return {
    ...event,
    calendarId: event.calendar_id,
    endDate: event.end_date || event.date,
    startTime: event.start_time,
    endTime: event.end_time,
    dayTimes,
    location: event.location || '',
    meetingUrl: event.meeting_url || '',
    recurrenceRule,
    recurrenceParentId: event.recurrence_parent_id || null,
    copyGroupId: event.copy_group_id || event.id,
    allDay: event.all_day === 1,
    isSystem: event.is_task_deadline === 1,
    isTaskDeadline: event.is_task_deadline === 1,
    taskId: event.task_id || undefined,
    taskBoardId: event.task_board_id || undefined,
    taskParentId: event.task_parent_id || undefined,
    attachments,
    attendees,
  };
}

// Utilitário para cálculo de ocorrências recorrentes (datas estritamente locais YYYY-MM-DD)
function generateRecurrenceDates(startDateStr, rule, maxOccurrences = 36) {
  if (!rule || !rule.frequency) return [];
  const [y, m, d] = startDateStr.split('-').map(Number);
  const dates = [];
  const cur = new Date(y, m - 1, d);
  const endLimit = rule.untilDate ? new Date(rule.untilDate + 'T12:00:00') : null;
  const countLimit = rule.occurrences ? Math.min(rule.occurrences, maxOccurrences) : maxOccurrences;

  const pad = n => String(n).padStart(2, '0');
  const toLocalYMD = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

  if (rule.frequency === 'daily') {
    const step = rule.interval || 1;
    for (let i = 1; i < countLimit; i++) {
      cur.setDate(cur.getDate() + step);
      if (endLimit && cur > endLimit) break;
      dates.push(toLocalYMD(cur));
    }
  } else if (rule.frequency === 'weekly') {
    const stepWeeks = rule.interval || 1;
    const targetDays = Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : [cur.getDay()];
    let temp = new Date(cur);
    let count = 1;
    while (count < countLimit && dates.length < 52) {
      temp.setDate(temp.getDate() + 1);
      if (endLimit && temp > endLimit) break;
      if (targetDays.includes(temp.getDay())) {
        dates.push(toLocalYMD(temp));
        count++;
      }
    }
  } else if (rule.frequency === 'biweekly') {
    for (let i = 1; i < countLimit; i++) {
      cur.setDate(cur.getDate() + 14);
      if (endLimit && cur > endLimit) break;
      dates.push(toLocalYMD(cur));
    }
  } else if (rule.frequency === 'monthly') {
    const step = rule.interval || 1;
    for (let i = 1; i < countLimit; i++) {
      cur.setMonth(cur.getMonth() + step);
      if (endLimit && cur > endLimit) break;
      dates.push(toLocalYMD(cur));
    }
  } else if (rule.frequency === 'yearly') {
    const step = rule.interval || 1;
    for (let i = 1; i < countLimit; i++) {
      cur.setFullYear(cur.getFullYear() + step);
      if (endLimit && cur > endLimit) break;
      dates.push(toLocalYMD(cur));
    }
  }
  return dates;
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
    WHERE e.calendar_id = $1
    ORDER BY e.date ASC, e.start_time ASC`, [calendarId]);

  res.json(await Promise.all(events.map(async event => {
    const attachments = await listAttachments(event.task_id ? 'task' : 'event', event.task_id || event.id);
    const attendees = await getAttendees(event.id);
    return eventDto(event, attachments, attendees);
  })));
}));

router.post('/:calendarId/events', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { calendarId } = req.params;
  if (!(await hasAccess(calendarId, userId, true))) return res.status(403).json({ error: 'Sem permissão para criar eventos' });

  const {
    title, description = '', date, endDate, startTime = '09:00', endTime = '10:00',
    dayTimes = {}, color = 'indigo', category = 'Geral', allDay = false, copyGroupId,
    location = '', meetingUrl = '', recurrenceRule = null, attendees = []
  } = req.body;

  const safeCategory = (typeof category === 'string' && SAFE_CATEGORY_RE.test(category.trim()))
    ? category.trim() : 'Geral';

  const validationError = validateEventInput({ title, description, date, endDate: endDate || date, startTime, endTime, dayTimes, color, category: safeCategory, allDay });
  if (validationError) return res.status(400).json({ error: validationError });

  const id = genId();
  const now = new Date().toISOString();
  const ruleJson = recurrenceRule ? JSON.stringify(recurrenceRule) : null;
  const targetCopyGroupId = copyGroupId || (recurrenceRule ? id : id);

  await db.run(`INSERT INTO events (id, calendar_id, title, description, date, end_date, start_time, end_time,
    day_times, color, category, all_day, created_by, copy_group_id, location, meeting_url, recurrence_rule, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [id, calendarId, title.trim(), description, date, endDate || date, startTime, endTime, JSON.stringify(dayTimes || {}), color, safeCategory, allDay ? 1 : 0, userId, targetCopyGroupId, location.trim(), meetingUrl.trim(), ruleJson, now]);

  // Inserir participantes
  if (Array.isArray(attendees) && attendees.length > 0) {
    for (const att of attendees) {
      if (!att.name && !att.email) continue;
      const attId = genAttendeeId();
      await db.run(`INSERT INTO event_attendees (id, event_id, user_id, name, email, status, role, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [attId, id, att.userId || null, att.name || 'Convidado', att.email || '', att.status || 'pending', att.role || 'required', now]);
      
      if (att.userId && att.userId !== userId) {
        await db.run(`INSERT INTO inapp_notifications (id, user_id, title, message, type, reference_type, reference_id, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          ['notif-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6), att.userId, 'Novo Convite de Evento', `Você foi convidado para: ${title.trim()}`, 'event_invite', 'event', id, now]);
      }
    }
  }

  // Gerar série recorrente no banco se houver recurrenceRule
  if (recurrenceRule) {
    const dates = generateRecurrenceDates(date, recurrenceRule);
    for (const nextDate of dates) {
      const childId = genId();
      // Calcular endDate proporcional se houver duração multi-dia
      let childEndDate = nextDate;
      if (endDate && endDate !== date) {
        const diffMs = new Date(endDate).getTime() - new Date(date).getTime();
        const nextEnd = new Date(new Date(nextDate).getTime() + diffMs);
        const pad = n => String(n).padStart(2, '0');
        childEndDate = `${nextEnd.getFullYear()}-${pad(nextEnd.getMonth() + 1)}-${pad(nextEnd.getDate())}`;
      }
      await db.run(`INSERT INTO events (id, calendar_id, title, description, date, end_date, start_time, end_time,
        day_times, color, category, all_day, created_by, copy_group_id, recurrence_parent_id, location, meeting_url, recurrence_rule, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [childId, calendarId, title.trim(), description, nextDate, childEndDate, startTime, endTime, JSON.stringify(dayTimes || {}), color, safeCategory, allDay ? 1 : 0, userId, targetCopyGroupId, id, location.trim(), meetingUrl.trim(), ruleJson, now]);
    }
  }

  const event = await db.get('SELECT * FROM events WHERE id = $1', [id]);
  req.broadcast({ type: 'event_created', calendarId, eventId: id });
  res.status(201).json(eventDto(event, await listAttachments('event', id), await getAttendees(id)));
}));

router.put('/:id', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const event = await db.get('SELECT * FROM events WHERE id = $1', [id]);
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
  if (!(await hasAccess(event.calendar_id, userId, true))) return res.status(403).json({ error: 'Sem permissão' });
  if (await isTaskDeadlineEvent(id)) return res.status(409).json({ error: 'O prazo desta tarefa deve ser alterado pelo card no Kanban' });

  const {
    title, description, date, endDate, startTime, endTime, dayTimes, color, category, allDay,
    location, meetingUrl, recurrenceRule, attendees, scope = 'this' // 'this' | 'future' | 'all'
  } = req.body;

  const safeCategory = category !== undefined
    ? ((typeof category === 'string' && SAFE_CATEGORY_RE.test(category.trim())) ? category.trim() : null)
    : undefined;
  if (safeCategory === null) return res.status(400).json({ error: 'Categoria contém caracteres inválidos' });

  const validationError = validateEventInput({ ...eventDto(event), ...req.body, ...(safeCategory !== undefined ? { category: safeCategory } : {}) });
  if (validationError) return res.status(400).json({ error: validationError });

  const now = new Date().toISOString();

  // Escopo de alteração de série recorrente
  if (scope === 'all' && event.copy_group_id) {
    await db.run(`UPDATE events SET
      title = COALESCE($1, title),
      description = COALESCE($2, description),
      start_time = COALESCE($3, start_time),
      end_time = COALESCE($4, end_time),
      color = COALESCE($5, color),
      category = COALESCE($6, category),
      location = COALESCE($7, location),
      meeting_url = COALESCE($8, meeting_url),
      updated_at = $9
      WHERE copy_group_id = $10`,
      [title ? title.trim() : null, description !== undefined ? description : null, startTime || null, endTime || null, color || null, safeCategory || null, location !== undefined ? location.trim() : null, meetingUrl !== undefined ? meetingUrl.trim() : null, now, event.copy_group_id]);
  } else if (scope === 'future' && event.copy_group_id) {
    await db.run(`UPDATE events SET
      title = COALESCE($1, title),
      description = COALESCE($2, description),
      start_time = COALESCE($3, start_time),
      end_time = COALESCE($4, end_time),
      color = COALESCE($5, color),
      category = COALESCE($6, category),
      location = COALESCE($7, location),
      meeting_url = COALESCE($8, meeting_url),
      updated_at = $9
      WHERE copy_group_id = $10 AND date >= $11`,
      [title ? title.trim() : null, description !== undefined ? description : null, startTime || null, endTime || null, color || null, safeCategory || null, location !== undefined ? location.trim() : null, meetingUrl !== undefined ? meetingUrl.trim() : null, now, event.copy_group_id, event.date]);
  } else {
    // Altera apenas esta ocorrência
    if (title !== undefined) await db.run('UPDATE events SET title = $1, updated_at = $2 WHERE id = $3', [title.trim(), now, id]);
    if (description !== undefined) await db.run('UPDATE events SET description = $1, updated_at = $2 WHERE id = $3', [description, now, id]);
    if (date) await db.run('UPDATE events SET date = $1, updated_at = $2 WHERE id = $3', [date, now, id]);
    if (endDate !== undefined) await db.run('UPDATE events SET end_date = $1, updated_at = $2 WHERE id = $3', [endDate, now, id]);
    if (startTime) await db.run('UPDATE events SET start_time = $1, updated_at = $2 WHERE id = $3', [startTime, now, id]);
    if (endTime) await db.run('UPDATE events SET end_time = $1, updated_at = $2 WHERE id = $3', [endTime, now, id]);
    if (dayTimes !== undefined) await db.run('UPDATE events SET day_times = $1, updated_at = $2 WHERE id = $3', [JSON.stringify(dayTimes), now, id]);
    if (color) await db.run('UPDATE events SET color = $1, updated_at = $2 WHERE id = $3', [color, now, id]);
    if (safeCategory !== undefined) await db.run('UPDATE events SET category = $1, updated_at = $2 WHERE id = $3', [safeCategory, now, id]);
    if (allDay !== undefined) await db.run('UPDATE events SET all_day = $1, updated_at = $2 WHERE id = $3', [allDay ? 1 : 0, now, id]);
    if (location !== undefined) await db.run('UPDATE events SET location = $1, updated_at = $2 WHERE id = $3', [location.trim(), now, id]);
    if (meetingUrl !== undefined) await db.run('UPDATE events SET meeting_url = $1, updated_at = $2 WHERE id = $3', [meetingUrl.trim(), now, id]);
    if (recurrenceRule !== undefined) await db.run('UPDATE events SET recurrence_rule = $1, updated_at = $2 WHERE id = $3', [recurrenceRule ? JSON.stringify(recurrenceRule) : null, now, id]);
  }

  // Atualizar participantes se enviados
  if (Array.isArray(attendees)) {
    await db.run('DELETE FROM event_attendees WHERE event_id = $1', [id]);
    for (const att of attendees) {
      if (!att.name && !att.email) continue;
      const attId = genAttendeeId();
      await db.run(`INSERT INTO event_attendees (id, event_id, user_id, name, email, status, role, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [attId, id, att.userId || null, att.name || 'Convidado', att.email || '', att.status || 'pending', att.role || 'required', now]);
    }
  }

  const updated = await db.get('SELECT * FROM events WHERE id = $1', [id]);
  req.broadcast({ type: 'event_updated', calendarId: event.calendar_id, eventId: id });
  res.json(eventDto(updated, await listAttachments('event', id), await getAttendees(id)));
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const { scope = 'this' } = req.query; // 'this' | 'future' | 'all'
  const event = await db.get('SELECT * FROM events WHERE id = $1', [id]);
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
  if (!(await hasAccess(event.calendar_id, userId, true))) return res.status(403).json({ error: 'Sem permissão' });
  if (await isTaskDeadlineEvent(id)) return res.status(409).json({ error: 'O prazo desta tarefa só pode ser removido pelo card no Kanban' });

  await db.transaction(async tx => {
    let idsToDelete = [id];
    if (scope === 'all' && event.copy_group_id) {
      const rows = await tx.all('SELECT id FROM events WHERE copy_group_id = $1', [event.copy_group_id]);
      idsToDelete = rows.map(r => r.id);
    } else if (scope === 'future' && event.copy_group_id) {
      const rows = await tx.all('SELECT id FROM events WHERE copy_group_id = $1 AND date >= $2', [event.copy_group_id, event.date]);
      idsToDelete = rows.map(r => r.id);
    }

    for (const delId of idsToDelete) {
      await tx.run(`DELETE FROM attachments WHERE owner_type = 'event' AND owner_id = $1`, [delId]);
      await tx.run('DELETE FROM event_attendees WHERE event_id = $1', [delId]);
      await tx.run('DELETE FROM events WHERE id = $1', [delId]);
    }
  });

  req.broadcast({ type: 'event_deleted', calendarId: event.calendar_id, eventId: id });
  res.json({ success: true });
}));

// Endpoint RSVP para participantes
router.put('/:id/rsvp', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const { status, email } = req.body; // 'accepted' | 'tentative' | 'declined'

  if (!['accepted', 'tentative', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'Status RSVP inválido' });
  }

  let attendee = null;
  if (userId) {
    attendee = await db.get('SELECT * FROM event_attendees WHERE event_id = $1 AND user_id = $2', [id, userId]);
  }
  if (!attendee && email) {
    attendee = await db.get('SELECT * FROM event_attendees WHERE event_id = $1 AND email = $2', [id, email]);
  }

  if (!attendee) {
    return res.status(404).json({ error: 'Participante não encontrado neste evento' });
  }

  await db.run('UPDATE event_attendees SET status = $1 WHERE id = $2', [status, attendee.id]);

  // Notificar o criador do evento
  const event = await db.get('SELECT * FROM events WHERE id = $1', [id]);
  if (event && event.created_by && event.created_by !== userId) {
    const now = new Date().toISOString();
    const stLabel = status === 'accepted' ? 'confirmou presença' : status === 'declined' ? 'recusou' : 'marcou talvez';
    await db.run(`INSERT INTO inapp_notifications (id, user_id, title, message, type, reference_type, reference_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['notif-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6), event.created_by, 'Resposta de RSVP', `${attendee.name || attendee.email} ${stLabel} no evento: ${event.title}`, 'rsvp', 'event', id, now]);
  }

  res.json({ success: true, attendeeId: attendee.id, status });
}));

// Exportação iCal RFC 5545 (.ics)
router.get('/:calendarId/export.ics', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { calendarId } = req.params;
  if (!(await hasAccess(calendarId, userId))) return res.status(403).json({ error: 'Sem acesso' });

  const calendar = await db.get('SELECT * FROM calendars WHERE id = $1', [calendarId]);
  const events = await db.all('SELECT * FROM events WHERE calendar_id = $1 ORDER BY date ASC', [calendarId]);

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DC Agenda//Agenda 1.0//PT',
    `X-WR-CALNAME:${(calendar && calendar.name) || 'Agenda'}`,
    'CALSCALE:GREGORIAN'
  ];

  for (const e of events) {
    const sDate = e.date ? e.date.replace(/-/g, '') : '';
    const eDate = (e.end_date || e.date).replace(/-/g, '');
    const sTime = e.start_time ? e.start_time.replace(':', '') + '00' : '000000';
    const eTime = e.end_time ? e.end_time.replace(':', '') + '00' : '235900';

    ics.push('BEGIN:VEVENT');
    ics.push(`UID:${e.id}@dcagenda.local`);
    ics.push(`SUMMARY:${(e.title || 'Evento').replace(/\n/g, ' ')}`);
    if (e.description) ics.push(`DESCRIPTION:${e.description.replace(/\n/g, '\\n')}`);
    if (e.location) ics.push(`LOCATION:${e.location.replace(/\n/g, ' ')}`);
    if (e.all_day === 1) {
      ics.push(`DTSTART;VALUE=DATE:${sDate}`);
      ics.push(`DTEND;VALUE=DATE:${eDate}`);
    } else {
      ics.push(`DTSTART:${sDate}T${sTime}`);
      ics.push(`DTEND:${eDate}T${eTime}`);
    }
    ics.push('END:VEVENT');
  }

  ics.push('END:VCALENDAR');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${calendar ? calendar.name : 'agenda'}.ics"`);
  res.send(ics.join('\r\n'));
}));

// Importação iCal RFC 5545 (.ics)
router.post('/:calendarId/import.ics', express.text({ type: ['text/calendar', 'text/plain'], limit: '10mb' }), asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { calendarId } = req.params;
  if (!(await hasAccess(calendarId, userId, true))) return res.status(403).json({ error: 'Sem permissão para importar nesta agenda' });

  const raw = req.body;
  if (!raw || typeof raw !== 'string' || !raw.includes('BEGIN:VCALENDAR')) {
    return res.status(400).json({ error: 'Arquivo iCalendar (.ics) inválido' });
  }

  const lines = raw.split(/\r\n|\r|\n/);
  const eventsToInsert = [];
  let currentEvent = null;

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      currentEvent = {};
    } else if (line.startsWith('END:VEVENT') && currentEvent) {
      eventsToInsert.push(currentEvent);
      currentEvent = null;
    } else if (currentEvent) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const key = line.slice(0, idx).trim().split(';')[0];
        const val = line.slice(idx + 1).trim();
        if (key === 'SUMMARY') currentEvent.title = val;
        else if (key === 'DESCRIPTION') currentEvent.description = val.replace(/\\n/g, '\n');
        else if (key === 'LOCATION') currentEvent.location = val;
        else if (key === 'DTSTART') {
          if (val.length === 8) { // YYYYMMDD
            currentEvent.date = `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
            currentEvent.allDay = true;
          } else if (val.includes('T')) {
            const [d, t] = val.split('T');
            currentEvent.date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
            currentEvent.startTime = `${t.slice(0, 2)}:${t.slice(2, 4)}`;
          }
        } else if (key === 'DTEND') {
          if (val.length === 8) {
            currentEvent.endDate = `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
          } else if (val.includes('T')) {
            const [d, t] = val.split('T');
            currentEvent.endDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
            currentEvent.endTime = `${t.slice(0, 2)}:${t.slice(2, 4)}`;
          }
        }
      }
    }
  }

  let importedCount = 0;
  const now = new Date().toISOString();
  await db.transaction(async tx => {
    for (const item of eventsToInsert) {
      if (!item.title || !item.date) continue;
      const id = genId();
      await tx.run(`INSERT INTO events (id, calendar_id, title, description, date, end_date, start_time, end_time,
        color, category, all_day, created_by, copy_group_id, location, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [id, calendarId, item.title, item.description || '', item.date, item.endDate || item.date, item.startTime || '09:00', item.endTime || '10:00', 'indigo', 'Geral', item.allDay ? 1 : 0, userId, id, item.location || '', now]);
      importedCount++;
    }
  });

  req.broadcast({ type: 'calendar_imported', calendarId, count: importedCount });
  res.json({ success: true, count: importedCount });
}));

module.exports = router;
module.exports.hasAccess = hasAccess;
module.exports.isTaskDeadlineEvent = isTaskDeadlineEvent;
module.exports.eventDto = eventDto;
