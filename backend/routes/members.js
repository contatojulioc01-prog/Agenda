const express = require('express');
const router = express.Router();
const db = require('../db');
const asyncRoute = require('../async-route');

function genId() {
  return 'mbr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function isTaskCalendar(calendarId) {
  const calendar = await db.get('SELECT is_task_calendar FROM calendars WHERE id = $1', [calendarId]);
  return calendar?.is_task_calendar === 1 || !!(await db.get('SELECT 1 FROM kanban_teams WHERE calendar_id = $1', [calendarId]));
}

router.get('/invitations', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(400).json({ error: 'User header required' });
  res.json(await db.all(`SELECT i.id, i.calendar_id, i.user_id, i.permission, i.created_at,
    c.name AS calendar_name, c.color AS calendar_color, c.owner_id
    FROM calendar_invitations i JOIN calendars c ON c.id = i.calendar_id
    WHERE i.user_id = $1 AND i.status = 'pending' ORDER BY i.created_at ASC`, [userId]));
}));

router.put('/invitations/:invitationId', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const invitation = await db.get("SELECT * FROM calendar_invitations WHERE id = $1 AND user_id = $2 AND status = 'pending'",
    [req.params.invitationId, userId]);
  if (!invitation) return res.status(404).json({ error: 'Invitation not found' });

  const accepted = req.body.accept === true;
  await db.transaction(async tx => {
    if (accepted) {
      await tx.run('INSERT INTO calendar_members (id, calendar_id, user_id, permission) VALUES ($1, $2, $3, $4) ON CONFLICT (calendar_id, user_id) DO NOTHING',
        [genId(), invitation.calendar_id, userId, invitation.permission]);
    }
    await tx.run('UPDATE calendar_invitations SET status = $1 WHERE id = $2', [accepted ? 'accepted' : 'declined', invitation.id]);
  });
  req.broadcast({ type: accepted ? 'invitation_accepted' : 'invitation_declined', calendarId: invitation.calendar_id, userId });
  res.json({ success: true, accepted });
}));

router.get('/:id/members', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(403).json({ error: 'x-user-id obrigatório' });
  const { id } = req.params;
  const access = await db.get('SELECT 1 FROM calendar_members WHERE calendar_id = $1 AND user_id = $2', [id, String(userId)]);
  if (!access) return res.status(403).json({ error: 'Sem acesso' });
  res.json(await db.all('SELECT * FROM calendar_members WHERE calendar_id = $1', [id]));
}));

router.post('/:id/members', asyncRoute(async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const { id } = req.params;
  const { userId, permission = 'viewer' } = req.body;
  if (await isTaskCalendar(id)) return res.status(409).json({ error: 'Os membros da agenda Tarefas são gerenciados pelo time' });
  if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

  const isOwner = await db.get("SELECT 1 FROM calendar_members WHERE calendar_id = $1 AND user_id = $2 AND permission = 'owner'", [id, ownerId]);
  if (!isOwner) return res.status(403).json({ error: 'Somente o dono pode adicionar membros' });
  if (!['editor', 'viewer'].includes(permission)) return res.status(400).json({ error: 'Permissão inválida' });

  const existingMember = await db.get('SELECT 1 FROM calendar_members WHERE calendar_id = $1 AND user_id = $2', [id, userId]);
  const pendingInvitation = await db.get("SELECT 1 FROM calendar_invitations WHERE calendar_id = $1 AND user_id = $2 AND status = 'pending'", [id, userId]);
  if (existingMember || pendingInvitation) return res.status(409).json({ error: 'Usuário já é membro ou está convidado' });

  const memberId = genId();
  await db.run(`INSERT INTO calendar_invitations (id, calendar_id, user_id, permission, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT(calendar_id, user_id) DO UPDATE SET permission = excluded.permission, status = 'pending', created_at = excluded.created_at`,
    [memberId, id, userId, permission, 'pending', new Date().toISOString()]);
  req.broadcast({ type: 'calendar_invited', calendarId: id, userId });
  res.status(201).json({ id: memberId, calendar_id: id, user_id: userId, permission, status: 'pending' });
}));

router.put('/:id/members/:memberId', asyncRoute(async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const { id, memberId } = req.params;
  const { permission } = req.body;
  if (await isTaskCalendar(id)) return res.status(409).json({ error: 'Os membros da agenda Tarefas são gerenciados pelo time' });
  const isOwner = await db.get("SELECT 1 FROM calendar_members WHERE calendar_id = $1 AND user_id = $2 AND permission = 'owner'", [id, ownerId]);
  if (!isOwner) return res.status(403).json({ error: 'Sem permissão' });
  if (!['editor', 'viewer'].includes(permission)) return res.status(400).json({ error: 'Permissão inválida' });
  const target = await db.get('SELECT * FROM calendar_members WHERE id = $1 AND calendar_id = $2', [memberId, id]);
  if (!target) return res.status(404).json({ error: 'Membro não encontrado' });
  if (target.permission === 'owner') return res.status(400).json({ error: 'A permissão do dono não pode ser alterada' });
  await db.run('UPDATE calendar_members SET permission = $1 WHERE id = $2 AND calendar_id = $3', [permission, memberId, id]);
  req.broadcast({ type: 'member_updated', calendarId: id });
  res.json({ success: true });
}));

router.delete('/:id/members/:memberId', asyncRoute(async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const { id, memberId } = req.params;
  if (await isTaskCalendar(id)) return res.status(409).json({ error: 'Os membros da agenda Tarefas são gerenciados pelo time' });
  const isOwner = await db.get("SELECT 1 FROM calendar_members WHERE calendar_id = $1 AND user_id = $2 AND permission = 'owner'", [id, ownerId]);
  if (!isOwner) return res.status(403).json({ error: 'Sem permissão' });
  const target = await db.get('SELECT * FROM calendar_members WHERE id = $1 AND calendar_id = $2', [memberId, id]);
  if (!target) return res.status(404).json({ error: 'Membro não encontrado' });
  if (target && target.permission === 'owner') return res.status(400).json({ error: 'Não pode remover o dono' });
  await db.run('DELETE FROM calendar_members WHERE id = $1 AND calendar_id = $2', [memberId, id]);
  req.broadcast({ type: 'member_removed', calendarId: id });
  res.json({ success: true });
}));

module.exports = router;
