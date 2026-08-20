const express = require('express');
const router = express.Router();
const db = require('../db');
const asyncRoute = require('../async-route');

function genId() {
  return 'cal-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function createDefaultCalendar(userId) {
  if (await db.get('SELECT id FROM calendars WHERE owner_id = ? AND is_private = 1 LIMIT 1', [userId])) return;
  const id = genId();
  await db.transaction(async tx => {
    if (await tx.get('SELECT id FROM calendars WHERE owner_id = ? AND is_private = 1 LIMIT 1', [userId])) return;
    await tx.run('INSERT INTO calendars (id, name, color, is_private, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, 'Minha Agenda', '#4f46e5', 1, userId, new Date().toISOString()]);
    await tx.run('INSERT INTO calendar_members (id, calendar_id, user_id, permission) VALUES (?, ?, ?, ?)',
      [genId(), id, userId, 'owner']);
  });
}

router.get('/', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(400).json({ error: 'x-user-id header obrigatório' });

  await createDefaultCalendar(userId);
  const rows = await db.all(`
    SELECT DISTINCT c.*, cm.permission as my_permission
    FROM calendars c
    LEFT JOIN calendar_members cm ON cm.calendar_id = c.id AND cm.user_id = ?
    WHERE c.owner_id = ? OR cm.user_id = ?
    ORDER BY c.created_at ASC
  `, [userId, userId, userId]);

  const result = await Promise.all(rows.map(async cal => {
    const members = await db.all('SELECT * FROM calendar_members WHERE calendar_id = ?', [cal.id]);
    return { ...cal, isPrivate: cal.is_private === 1, members };
  }));

  res.json(result);
}));

router.post('/', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(400).json({ error: 'x-user-id header obrigatório' });

  const { name, color = '#4f46e5', isPrivate = true, members = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });

  const id = genId();
  const now = new Date().toISOString();
  await db.transaction(async tx => {
    await tx.run('INSERT INTO calendars (id, name, color, is_private, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, color, isPrivate ? 1 : 0, userId, now]);
    await tx.run('INSERT INTO calendar_members (id, calendar_id, user_id, permission) VALUES (?, ?, ?, ?)',
      [genId(), id, userId, 'owner']);

    if (Array.isArray(members)) {
      for (const member of members) {
        const memberUserId = member.user_id || member.userId;
        if (!memberUserId || memberUserId === userId) continue;
        await tx.run('INSERT INTO calendar_invitations (id, calendar_id, user_id, permission, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [genId(), id, memberUserId, member.permission || 'editor', 'pending', now]);
      }
    }
  });

  if (Array.isArray(members)) {
    members.forEach(member => {
      const memberUserId = member.user_id || member.userId;
      if (memberUserId && memberUserId !== userId) req.broadcast({ type: 'calendar_invited', calendarId: id, userId: memberUserId });
    });
  }

  const calendar = await db.get('SELECT * FROM calendars WHERE id = ?', [id]);
  const memberRows = await db.all('SELECT * FROM calendar_members WHERE calendar_id = ?', [id]);
  req.broadcast({ type: 'calendar_created', calendarId: id });
  res.status(201).json({ ...calendar, isPrivate: calendar.is_private === 1, members: memberRows });
}));

router.put('/:id', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const member = await db.get('SELECT permission FROM calendar_members WHERE calendar_id = ? AND user_id = ?', [id, userId]);
  if (!member || !['owner', 'editor'].includes(member.permission)) return res.status(403).json({ error: 'Sem permissão' });

  const { name, color, isPrivate } = req.body;
  if (name) await db.run('UPDATE calendars SET name = ? WHERE id = ?', [name, id]);
  if (color) await db.run('UPDATE calendars SET color = ? WHERE id = ?', [color, id]);
  if (isPrivate !== undefined) await db.run('UPDATE calendars SET is_private = ? WHERE id = ?', [isPrivate ? 1 : 0, id]);
  const calendar = await db.get('SELECT * FROM calendars WHERE id = ?', [id]);
  req.broadcast({ type: 'calendar_updated', calendarId: id });
  res.json({ ...calendar, isPrivate: calendar.is_private === 1 });
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const calendar = await db.get('SELECT * FROM calendars WHERE id = ? AND owner_id = ?', [id, userId]);
  if (!calendar) return res.status(403).json({ error: 'Sem permissão' });

  await db.transaction(async tx => {
    await tx.run('DELETE FROM kanban_task_events WHERE calendar_id = ?', [id]);
    await tx.run('DELETE FROM calendar_invitations WHERE calendar_id = ?', [id]);
    await tx.run('DELETE FROM calendar_members WHERE calendar_id = ?', [id]);
    await tx.run('DELETE FROM events WHERE calendar_id = ?', [id]);
    await tx.run('DELETE FROM calendars WHERE id = ?', [id]);
  });
  req.broadcast({ type: 'calendar_deleted', calendarId: id });
  res.json({ success: true });
}));

module.exports = router;
