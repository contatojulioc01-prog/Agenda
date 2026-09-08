const express = require('express');
const router = express.Router();
const db = require('../db');
const asyncRoute = require('../async-route');
const { isHexColor, isNonEmptyString } = require('../validation');

function genId() {
  return 'cal-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function createDefaultCalendar(userId) {
  if (await db.get('SELECT id FROM calendars WHERE owner_id = $1 AND is_default = 1 LIMIT 1', [userId])) return;
  const id = genId();
  await db.transaction(async tx => {
    await tx.get('SELECT pg_advisory_xact_lock(hashtext($1))', [`default-calendar:${userId}`]);
    if (await tx.get('SELECT id FROM calendars WHERE owner_id = $1 AND is_default = 1 LIMIT 1', [userId])) return;
    await tx.run('INSERT INTO calendars (id, name, color, is_private, owner_id, is_default, created_at) VALUES ($1, $2, $3, $4, $5, 1, $6)',
      [id, 'Minha Agenda', '#4f46e5', 1, userId, new Date().toISOString()]);
    await tx.run('INSERT INTO calendar_members (id, calendar_id, user_id, permission) VALUES ($1, $2, $3, $4)',
      [genId(), id, userId, 'owner']);
  });
}

router.get('/', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(400).json({ error: 'x-user-id header obrigatório' });

  await createDefaultCalendar(userId);
  const rows = await db.all(`
    SELECT DISTINCT c.*, cm.permission as my_permission, kt.name AS task_team_name
    FROM calendars c
    LEFT JOIN calendar_members cm ON cm.calendar_id = c.id AND cm.user_id = $1
    LEFT JOIN kanban_teams kt ON kt.calendar_id = c.id
    WHERE c.owner_id = $2 OR cm.user_id = $3
    ORDER BY c.created_at ASC
  `, [userId, userId, userId]);

  const result = await Promise.all(rows.map(async cal => {
    const members = await db.all('SELECT * FROM calendar_members WHERE calendar_id = $1', [cal.id]);
    return {
      ...cal,
      isPrivate: cal.is_private === 1,
      isDefault: cal.is_default === 1,
      isTaskCalendar: cal.is_task_calendar === 1,
      taskTeamName: cal.task_team_name || null,
      members,
    };
  }));

  res.json(result);
}));

router.post('/', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(400).json({ error: 'x-user-id header obrigatório' });

  const { name, color = '#4f46e5', isPrivate = true, members = [] } = req.body;
  if (!isNonEmptyString(name, 80)) return res.status(400).json({ error: 'Nome inválido (máximo de 80 caracteres)' });
  if (!isHexColor(color)) return res.status(400).json({ error: 'Cor inválida' });
  if (typeof isPrivate !== 'boolean') return res.status(400).json({ error: 'Privacidade inválida' });
  if (!Array.isArray(members) || members.length > 200 || members.some(member =>
    !member || !(member.user_id || member.userId) || !['editor', 'viewer'].includes(member.permission || 'editor')
  )) return res.status(400).json({ error: 'Lista de membros inválida' });

  const id = genId();
  const now = new Date().toISOString();
  await db.transaction(async tx => {
    await tx.run('INSERT INTO calendars (id, name, color, is_private, owner_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, name.trim(), color, isPrivate ? 1 : 0, userId, now]);
    await tx.run('INSERT INTO calendar_members (id, calendar_id, user_id, permission) VALUES ($1, $2, $3, $4)',
      [genId(), id, userId, 'owner']);

    if (Array.isArray(members)) {
      for (const member of members) {
        const memberUserId = member.user_id || member.userId;
        if (!memberUserId || memberUserId === userId) continue;
        await tx.run('INSERT INTO calendar_invitations (id, calendar_id, user_id, permission, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
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

  const calendar = await db.get('SELECT * FROM calendars WHERE id = $1', [id]);
  const memberRows = await db.all('SELECT * FROM calendar_members WHERE calendar_id = $1', [id]);
  req.broadcast({ type: 'calendar_created', calendarId: id });
  res.status(201).json({ ...calendar, isPrivate: calendar.is_private === 1, isDefault: false, members: memberRows });
}));

router.put('/:id', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const member = await db.get('SELECT permission FROM calendar_members WHERE calendar_id = $1 AND user_id = $2', [id, userId]);
  if (!member || !['owner', 'editor'].includes(member.permission)) return res.status(403).json({ error: 'Sem permissão' });

  const { name, color, isPrivate } = req.body;
  if (isPrivate !== undefined && member.permission !== 'owner') return res.status(403).json({ error: 'Somente o dono pode alterar a privacidade' });
  const existingCalendar = await db.get('SELECT * FROM calendars WHERE id = $1', [id]);
  if (existingCalendar?.is_task_calendar || await db.get('SELECT 1 FROM kanban_teams WHERE calendar_id = $1', [id])) {
    return res.status(409).json({ error: 'A agenda Tarefas é gerenciada automaticamente pelo time' });
  }
  if (existingCalendar?.is_default && isPrivate === false) return res.status(409).json({ error: 'A agenda padrão deve permanecer privada' });
  if (name !== undefined && !isNonEmptyString(name, 80)) return res.status(400).json({ error: 'Nome inválido (máximo de 80 caracteres)' });
  if (color !== undefined && !isHexColor(color)) return res.status(400).json({ error: 'Cor inválida' });
  if (isPrivate !== undefined && typeof isPrivate !== 'boolean') return res.status(400).json({ error: 'Privacidade inválida' });
  if (name !== undefined) await db.run('UPDATE calendars SET name = $1 WHERE id = $2', [name.trim(), id]);
  if (color !== undefined) await db.run('UPDATE calendars SET color = $1 WHERE id = $2', [color, id]);
  if (isPrivate !== undefined) await db.run('UPDATE calendars SET is_private = $1 WHERE id = $2', [isPrivate ? 1 : 0, id]);
  const calendar = await db.get('SELECT * FROM calendars WHERE id = $1', [id]);
  req.broadcast({ type: 'calendar_updated', calendarId: id });
  res.json({ ...calendar, isPrivate: calendar.is_private === 1, isDefault: calendar.is_default === 1, isTaskCalendar: false });
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const calendar = await db.get('SELECT * FROM calendars WHERE id = $1 AND owner_id = $2', [id, userId]);
  if (!calendar) return res.status(403).json({ error: 'Sem permissão' });
  if (calendar.is_default) return res.status(409).json({ error: 'A agenda padrão não pode ser excluída' });
  if (calendar.is_task_calendar || await db.get('SELECT 1 FROM kanban_teams WHERE calendar_id = $1', [id])) {
    return res.status(409).json({ error: 'A agenda Tarefas só pode ser excluída junto com o time' });
  }

  await db.transaction(async tx => {
    await tx.run('DELETE FROM kanban_task_events WHERE calendar_id = $1', [id]);
    await tx.run('DELETE FROM calendar_invitations WHERE calendar_id = $1', [id]);
    await tx.run('DELETE FROM calendar_members WHERE calendar_id = $1', [id]);
    await tx.run('DELETE FROM events WHERE calendar_id = $1', [id]);
    await tx.run('DELETE FROM calendars WHERE id = $1', [id]);
  });
  req.broadcast({ type: 'calendar_deleted', calendarId: id });
  res.json({ success: true });
}));

module.exports = router;
