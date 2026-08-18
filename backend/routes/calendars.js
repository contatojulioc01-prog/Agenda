const express = require('express');
const router = express.Router();
const db = require('../db');

function genId() {
  return 'cal-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// GET /api/calendars
router.get('/', (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(400).json({ error: 'x-user-id header obrigatório' });

  const rows = db.all(`
    SELECT DISTINCT c.*, cm.permission as my_permission
    FROM calendars c
    LEFT JOIN calendar_members cm ON cm.calendar_id = c.id AND cm.user_id = ?
    WHERE c.owner_id = ? OR cm.user_id = ?
    ORDER BY c.created_at ASC
  `, [userId, userId, userId]);

  const result = rows.map(cal => {
    const members = db.all('SELECT * FROM calendar_members WHERE calendar_id = ?', [cal.id]);
    return { ...cal, isPrivate: cal.is_private === 1, members };
  });

  res.json(result);
});

// POST /api/calendars
router.post('/', (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(400).json({ error: 'x-user-id header obrigatório' });

  const { name, color = '#4f46e5', isPrivate = false, members = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });

  const id = genId();
  const now = new Date().toISOString();
  db.run('INSERT INTO calendars (id, name, color, is_private, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, color, isPrivate ? 1 : 0, userId, now]);
  db.run('INSERT INTO calendar_members (id, calendar_id, user_id, permission) VALUES (?, ?, ?, ?)',
    [genId(), id, userId, 'owner']);

  if (Array.isArray(members)) {
    members.forEach(m => {
      const memberUserId = m.user_id || m.userId;
      if (memberUserId && memberUserId !== userId) {
        db.run('INSERT INTO calendar_members (id, calendar_id, user_id, permission) VALUES (?, ?, ?, ?)',
          [genId(), id, memberUserId, m.permission || 'editor']);
      }
    });
  }

  const calendar = db.get('SELECT * FROM calendars WHERE id = ?', [id]);
  const memberRows = db.all('SELECT * FROM calendar_members WHERE calendar_id = ?', [id]);
  req.broadcast({ type: 'calendar_created', calendarId: id });
  res.status(201).json({ ...calendar, isPrivate: calendar.is_private === 1, members: memberRows });
});

// PUT /api/calendars/:id
router.put('/:id', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const member = db.get('SELECT permission FROM calendar_members WHERE calendar_id = ? AND user_id = ?', [id, userId]);
  if (!member || !['owner', 'editor'].includes(member.permission)) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const { name, color, isPrivate } = req.body;
  if (name) db.run('UPDATE calendars SET name = ? WHERE id = ?', [name, id]);
  if (color) db.run('UPDATE calendars SET color = ? WHERE id = ?', [color, id]);
  if (isPrivate !== undefined) db.run('UPDATE calendars SET is_private = ? WHERE id = ?', [isPrivate ? 1 : 0, id]);
  const calendar = db.get('SELECT * FROM calendars WHERE id = ?', [id]);
  req.broadcast({ type: 'calendar_updated', calendarId: id });
  res.json({ ...calendar, isPrivate: calendar.is_private === 1 });
});

// DELETE /api/calendars/:id
router.delete('/:id', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const cal = db.get('SELECT * FROM calendars WHERE id = ? AND owner_id = ?', [id, userId]);
  if (!cal) return res.status(403).json({ error: 'Sem permissão' });
  db.run('DELETE FROM calendar_members WHERE calendar_id = ?', [id]);
  db.run('DELETE FROM events WHERE calendar_id = ?', [id]);
  db.run('DELETE FROM calendars WHERE id = ?', [id]);
  req.broadcast({ type: 'calendar_deleted', calendarId: id });
  res.json({ success: true });
});

module.exports = router;
