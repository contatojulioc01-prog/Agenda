const express = require('express');
const router = express.Router();
const db = require('../db');

function genId() {
  return 'mbr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// GET /api/calendars/:id/members
router.get('/:id/members', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const access = db.get('SELECT 1 FROM calendar_members WHERE calendar_id = ? AND user_id = ?', [id, userId]);
  if (!access) return res.status(403).json({ error: 'Sem acesso' });
  res.json(db.all('SELECT * FROM calendar_members WHERE calendar_id = ?', [id]));
});

// POST /api/calendars/:id/members
router.post('/:id/members', (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const { id } = req.params;
  const { userId, permission = 'viewer' } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

  const isOwner = db.get("SELECT 1 FROM calendar_members WHERE calendar_id = ? AND user_id = ? AND permission = 'owner'", [id, ownerId]);
  if (!isOwner) return res.status(403).json({ error: 'Somente o dono pode adicionar membros' });
  if (!['editor', 'viewer'].includes(permission)) return res.status(400).json({ error: 'Permissão inválida' });

  const existing = db.get('SELECT 1 FROM calendar_members WHERE calendar_id = ? AND user_id = ?', [id, userId]);
  if (existing) return res.status(409).json({ error: 'Usuário já é membro' });

  const memberId = genId();
  db.run('INSERT INTO calendar_members (id, calendar_id, user_id, permission) VALUES (?, ?, ?, ?)',
    [memberId, id, userId, permission]);
  req.broadcast({ type: 'member_added', calendarId: id, userId });
  res.status(201).json({ id: memberId, calendar_id: id, user_id: userId, permission });
});

// PUT /api/calendars/:id/members/:memberId
router.put('/:id/members/:memberId', (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const { id, memberId } = req.params;
  const { permission } = req.body;
  const isOwner = db.get("SELECT 1 FROM calendar_members WHERE calendar_id = ? AND user_id = ? AND permission = 'owner'", [id, ownerId]);
  if (!isOwner) return res.status(403).json({ error: 'Sem permissão' });
  if (!['editor', 'viewer'].includes(permission)) return res.status(400).json({ error: 'Permissão inválida' });
  db.run('UPDATE calendar_members SET permission = ? WHERE id = ? AND calendar_id = ?', [permission, memberId, id]);
  req.broadcast({ type: 'member_updated', calendarId: id });
  res.json({ success: true });
});

// DELETE /api/calendars/:id/members/:memberId
router.delete('/:id/members/:memberId', (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const { id, memberId } = req.params;
  const isOwner = db.get("SELECT 1 FROM calendar_members WHERE calendar_id = ? AND user_id = ? AND permission = 'owner'", [id, ownerId]);
  if (!isOwner) return res.status(403).json({ error: 'Sem permissão' });
  const target = db.get('SELECT * FROM calendar_members WHERE id = ?', [memberId]);
  if (target && target.permission === 'owner') return res.status(400).json({ error: 'Não pode remover o dono' });
  db.run('DELETE FROM calendar_members WHERE id = ? AND calendar_id = ?', [memberId, id]);
  req.broadcast({ type: 'member_removed', calendarId: id });
  res.json({ success: true });
});

module.exports = router;
