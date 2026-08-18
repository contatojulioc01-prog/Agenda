const express = require('express');
const router = express.Router();
const db = require('../db');

function genId() {
  return 'evt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function hasAccess(calendarId, userId, requireWrite = false) {
  if (!calendarId) return true;
  const cal = db.get('SELECT * FROM calendars WHERE id = ?', [calendarId]);
  if (!cal) return true; // Agenda padrão/local
  if (cal.owner_id === userId) return true;

  const member = db.get('SELECT permission FROM calendar_members WHERE calendar_id = ? AND user_id = ?', [calendarId, userId]);
  if (member) {
    if (requireWrite) return ['owner', 'editor'].includes(member.permission);
    return true;
  }

  // Se a agenda não for privada e for apenas leitura
  if (cal.is_private === 0 && !requireWrite) return true;

  return false;
}

// GET /api/calendars/:calendarId/events
router.get('/:calendarId/events', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { calendarId } = req.params;
  if (!hasAccess(calendarId, userId)) return res.status(403).json({ error: 'Sem acesso' });
  const events = db.all('SELECT * FROM events WHERE calendar_id = ? ORDER BY date ASC, start_time ASC', [calendarId]);
  res.json(events.map(ev => ({
    ...ev,
    calendarId: ev.calendar_id,
    startTime: ev.start_time,
    endTime: ev.end_time,
    allDay: ev.all_day === 1,
  })));
});

// POST /api/calendars/:calendarId/events
router.post('/:calendarId/events', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { calendarId } = req.params;
  if (!hasAccess(calendarId, userId, true)) return res.status(403).json({ error: 'Sem permissão para criar eventos' });

  const { title, description = '', date, startTime = '09:00', endTime = '10:00', color = 'indigo', category = 'Geral', allDay = false } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'title e date são obrigatórios' });

  const id = genId();
  const now = new Date().toISOString();
  db.run('INSERT INTO events (id, calendar_id, title, description, date, start_time, end_time, color, category, all_day, created_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, calendarId, title, description, date, startTime, endTime, color, category, allDay ? 1 : 0, userId, now]);

  const event = db.get('SELECT * FROM events WHERE id = ?', [id]);
  req.broadcast({ type: 'event_created', calendarId, eventId: id });
  res.status(201).json({
    ...event, calendarId: event.calendar_id,
    startTime: event.start_time, endTime: event.end_time, allDay: event.all_day === 1,
  });
});

// PUT /api/events/:id
router.put('/:id', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const event = db.get('SELECT * FROM events WHERE id = ?', [id]);
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
  if (!hasAccess(event.calendar_id, userId, true)) return res.status(403).json({ error: 'Sem permissão' });

  const { title, description, date, startTime, endTime, color, category, allDay } = req.body;
  const now = new Date().toISOString();
  if (title) db.run('UPDATE events SET title = ?, updated_at = ? WHERE id = ?', [title, now, id]);
  if (description !== undefined) db.run('UPDATE events SET description = ?, updated_at = ? WHERE id = ?', [description, now, id]);
  if (date) db.run('UPDATE events SET date = ?, updated_at = ? WHERE id = ?', [date, now, id]);
  if (startTime) db.run('UPDATE events SET start_time = ?, updated_at = ? WHERE id = ?', [startTime, now, id]);
  if (endTime) db.run('UPDATE events SET end_time = ?, updated_at = ? WHERE id = ?', [endTime, now, id]);
  if (color) db.run('UPDATE events SET color = ?, updated_at = ? WHERE id = ?', [color, now, id]);
  if (category) db.run('UPDATE events SET category = ?, updated_at = ? WHERE id = ?', [category, now, id]);
  if (allDay !== undefined) db.run('UPDATE events SET all_day = ?, updated_at = ? WHERE id = ?', [allDay ? 1 : 0, now, id]);

  const updated = db.get('SELECT * FROM events WHERE id = ?', [id]);
  req.broadcast({ type: 'event_updated', calendarId: event.calendar_id, eventId: id });
  res.json({
    ...updated, calendarId: updated.calendar_id,
    startTime: updated.start_time, endTime: updated.end_time, allDay: updated.all_day === 1,
  });
});

// DELETE /api/events/:id
router.delete('/:id', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const event = db.get('SELECT * FROM events WHERE id = ?', [id]);
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
  if (!hasAccess(event.calendar_id, userId, true)) return res.status(403).json({ error: 'Sem permissão' });
  db.run('DELETE FROM events WHERE id = ?', [id]);
  req.broadcast({ type: 'event_deleted', calendarId: event.calendar_id, eventId: id });
  res.json({ success: true });
});

module.exports = router;
