const fs = require('fs');
const express = require('express');
const router = express.Router();
const db = require('../db');
const asyncRoute = require('../async-route');
const { listAttachments } = require('./attachments');

const id = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const userId = req => String(req.headers['x-user-id'] || '');

async function muralAccess(muralId, uid, write = false) {
  const mural = await db.get('SELECT * FROM mural_boards WHERE id = $1', [muralId]);
  if (!mural) return null;
  if (mural.scope_type !== 'team') {
    return mural.owner_id === uid ? { mural, role: 'admin' } : null;
  }
  const member = await db.get('SELECT role FROM kanban_team_members WHERE team_id = $1 AND user_id = $2', [mural.team_id, uid]);
  if (!member || (write && !['admin', 'member'].includes(member.role))) return null;
  return { mural, role: member.role };
}

function muralDto(mural, role, itemCount = 0) {
  return {
    id: mural.id,
    name: mural.name,
    description: mural.description || '',
    color: mural.color || '#f59e0b',
    owner_id: mural.owner_id,
    scopeType: mural.scope_type || 'personal',
    teamId: mural.team_id || null,
    myRole: role,
    itemCount: Number(itemCount || 0),
    createdAt: mural.created_at,
    updatedAt: mural.updated_at,
  };
}

function groupDto(group) {
  return {
    id: group.id,
    muralId: group.mural_id,
    title: group.title,
    color: group.color || '#64748b',
    position: Number(group.position || 0),
    createdAt: group.created_at,
  };
}

function itemDto(item, attachments = []) {
  return {
    id: item.id,
    muralId: item.mural_id,
    groupId: item.group_id || null,
    title: item.title,
    content: item.content || '',
    color: item.color || '#fef08a',
    isPinned: item.is_pinned === 1,
    position: Number(item.position || 0),
    rotation: Number(item.rotation || 0),
    createdBy: item.created_by,
    createdByName: item.created_by_name || '',
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    attachments,
  };
}

async function ensurePersonalMural(uid) {
  let mural = await db.get("SELECT * FROM mural_boards WHERE owner_id = $1 AND scope_type = 'personal' ORDER BY created_at LIMIT 1", [uid]);
  if (mural) return mural;
  const boardId = id('mrl');
  const now = new Date().toISOString();
  await db.transaction(async tx => {
    await tx.run(`INSERT INTO mural_boards (id, name, description, color, owner_id, scope_type, team_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'personal', NULL, $6, $6)`,
      [boardId, 'Meu Mural', 'Meu espaço pessoal de avisos, ideias e notas', '#f59e0b', uid, now]);
    const defaultGroups = [['Avisos & Lembretes', '#f59e0b'], ['Ideias & Projetos', '#0ea5e9']];
    for (const [pos, [title, color]] of defaultGroups.entries()) {
      await tx.run('INSERT INTO mural_groups (id, mural_id, title, color, position, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [id('grp'), boardId, title, color, pos, now]);
    }
  });
  return db.get('SELECT * FROM mural_boards WHERE id = $1', [boardId]);
}

async function ensureTeamMural(team, store = db) {
  let mural = await store.get("SELECT * FROM mural_boards WHERE team_id = $1 AND scope_type = 'team' LIMIT 1", [team.id]);
  if (mural) return mural;
  const boardId = id('mrl');
  const now = new Date().toISOString();
  await store.run(`INSERT INTO mural_boards (id, name, description, color, owner_id, scope_type, team_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, 'team', $6, $7, $7)`,
    [boardId, `Mural - ${team.name}`, team.description || '', team.color || '#4f46e5', team.owner_id, team.id, now]);
  const defaultGroups = [['Quadro de Avisos', team.color || '#4f46e5'], ['Documentações & Links', '#10b981']];
  for (const [pos, [title, color]] of defaultGroups.entries()) {
    await store.run('INSERT INTO mural_groups (id, mural_id, title, color, position, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id('grp'), boardId, title, color, pos, now]);
  }
  return store.get('SELECT * FROM mural_boards WHERE id = $1', [boardId]);
}

// GET /api/mural/boards
router.get('/boards', asyncRoute(async (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(401).json({ error: 'Não autorizado' });

  await ensurePersonalMural(uid);

  const teamMemberships = await db.all(`
    SELECT t.*, m.role as my_role
    FROM kanban_teams t
    JOIN kanban_team_members m ON m.team_id = t.id
    WHERE m.user_id = $1
  `, [uid]);

  for (const team of teamMemberships) {
    await ensureTeamMural(team);
  }

  const personalBoards = await db.all(`
    SELECT b.*,
      (SELECT COUNT(*) FROM mural_items i WHERE i.mural_id = b.id) as item_count
    FROM mural_boards b
    WHERE b.owner_id = $1 AND b.scope_type = 'personal'
    ORDER BY b.created_at
  `, [uid]);

  const teamBoards = await db.all(`
    SELECT b.*, t.name as team_name, m.role as my_role,
      (SELECT COUNT(*) FROM mural_items i WHERE i.mural_id = b.id) as item_count
    FROM mural_boards b
    JOIN kanban_teams t ON t.id = b.team_id
    JOIN kanban_team_members m ON m.team_id = t.id AND m.user_id = $1
    WHERE b.scope_type = 'team'
    ORDER BY b.created_at
  `, [uid]);

  const summaries = [
    ...personalBoards.map(b => muralDto(b, 'admin', b.item_count)),
    ...teamBoards.map(b => ({ ...muralDto(b, b.my_role, b.item_count), teamName: b.team_name }))
  ];

  res.json(summaries);
}));

// GET /api/mural/boards/:id
router.get('/boards/:id', asyncRoute(async (req, res) => {
  const uid = userId(req);
  const access = await muralAccess(req.params.id, uid);
  if (!access) return res.status(404).json({ error: 'Mural não encontrado ou sem permissão de acesso' });

  const { mural, role } = access;
  const groups = await db.all('SELECT * FROM mural_groups WHERE mural_id = $1 ORDER BY position, created_at', [mural.id]);
  const itemRows = await db.all('SELECT * FROM mural_items WHERE mural_id = $1 ORDER BY is_pinned DESC, position ASC, created_at DESC', [mural.id]);

  const items = [];
  for (const row of itemRows) {
    const attachments = await listAttachments('mural_item', row.id);
    items.push(itemDto(row, attachments));
  }

  let teamMembers = [];
  if (mural.scope_type === 'team' && mural.team_id) {
    teamMembers = await db.all('SELECT user_id, role, joined_at FROM kanban_team_members WHERE team_id = $1 ORDER BY joined_at', [mural.team_id]);
  }

  res.json({
    board: muralDto(mural, role, items.length),
    groups: groups.map(groupDto),
    items,
    teamMembers,
  });
}));

// POST /api/mural/boards
router.post('/boards', asyncRoute(async (req, res) => {
  const uid = userId(req);
  const { name, description = '', color = '#f59e0b', scopeType = 'personal', teamId = null } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Nome do mural é obrigatório' });

  if (scopeType === 'team') {
    if (!teamId) return res.status(400).json({ error: 'Team ID é obrigatório para mural de equipe' });
    const teamMember = await db.get('SELECT role FROM kanban_team_members WHERE team_id = $1 AND user_id = $2', [teamId, uid]);
    if (!teamMember || teamMember.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem criar murais de equipe' });
  }

  const boardId = id('mrl');
  const now = new Date().toISOString();
  await db.transaction(async tx => {
    await tx.run(`INSERT INTO mural_boards (id, name, description, color, owner_id, scope_type, team_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [boardId, name.trim(), description, color, uid, scopeType, scopeType === 'team' ? teamId : null, now]);
    await tx.run('INSERT INTO mural_groups (id, mural_id, title, color, position, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id('grp'), boardId, 'Geral', color, 0, now]);
  });

  const created = await db.get('SELECT * FROM mural_boards WHERE id = $1', [boardId]);
  req.broadcast?.({ type: 'mural_updated', muralId: boardId });
  res.status(201).json(muralDto(created, 'admin', 0));
}));

// PUT /api/mural/boards/:id
router.put('/boards/:id', asyncRoute(async (req, res) => {
  const uid = userId(req);
  const access = await muralAccess(req.params.id, uid, true);
  if (!access) return res.status(404).json({ error: 'Mural não encontrado ou sem permissão' });
  if (access.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem editar o mural' });

  const { name, description, color } = req.body;
  const updates = [];
  const params = [];
  let idx = 1;

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'Nome inválido' });
    updates.push(`name = $${idx++}`);
    params.push(name.trim());
  }
  if (description !== undefined) {
    updates.push(`description = $${idx++}`);
    params.push(description);
  }
  if (color !== undefined) {
    updates.push(`color = $${idx++}`);
    params.push(color);
  }

  if (updates.length) {
    updates.push(`updated_at = $${idx++}`);
    params.push(new Date().toISOString());
    params.push(req.params.id);
    await db.run(`UPDATE mural_boards SET ${updates.join(', ')} WHERE id = $${idx}`, params);
  }

  const updated = await db.get('SELECT * FROM mural_boards WHERE id = $1', [req.params.id]);
  req.broadcast?.({ type: 'mural_updated', muralId: req.params.id });
  res.json(muralDto(updated, access.role));
}));

// DELETE /api/mural/boards/:id
router.delete('/boards/:id', asyncRoute(async (req, res) => {
  const uid = userId(req);
  const access = await muralAccess(req.params.id, uid, true);
  if (!access) return res.status(404).json({ error: 'Mural não encontrado ou sem permissão' });
  if (access.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem excluir o mural' });

  // Delete all attachments of all items
  const items = await db.all('SELECT id FROM mural_items WHERE mural_id = $1', [req.params.id]);
  const itemIds = items.map(i => i.id);
  if (itemIds.length) {
    const atts = await db.all(`SELECT file_path FROM attachments WHERE owner_type = 'mural_item' AND owner_id = ANY($1)`, [itemIds]);
    for (const att of atts) {
      if (att.file_path && fs.existsSync(att.file_path)) {
        try { await fs.promises.unlink(att.file_path); } catch {}
      }
    }
    await db.run(`DELETE FROM attachments WHERE owner_type = 'mural_item' AND owner_id = ANY($1)`, [itemIds]);
  }

  await db.transaction(async tx => {
    await tx.run('DELETE FROM mural_items WHERE mural_id = $1', [req.params.id]);
    await tx.run('DELETE FROM mural_groups WHERE mural_id = $1', [req.params.id]);
    await tx.run('DELETE FROM mural_boards WHERE id = $1', [req.params.id]);
  });

  req.broadcast?.({ type: 'mural_deleted', muralId: req.params.id });
  res.json({ success: true });
}));

// POST /api/mural/boards/:id/groups
router.post('/boards/:id/groups', asyncRoute(async (req, res) => {
  const uid = userId(req);
  const access = await muralAccess(req.params.id, uid, true);
  if (!access) return res.status(404).json({ error: 'Mural não encontrado ou sem permissão' });

  const { title, color = '#64748b' } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Título do grupo é obrigatório' });

  const maxPos = await db.get('SELECT COALESCE(MAX(position), -1) as max_p FROM mural_groups WHERE mural_id = $1', [req.params.id]);
  const groupId = id('grp');
  const now = new Date().toISOString();

  await db.run('INSERT INTO mural_groups (id, mural_id, title, color, position, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [groupId, req.params.id, title.trim(), color, Number(maxPos.max_p) + 1, now]);

  const created = await db.get('SELECT * FROM mural_groups WHERE id = $1', [groupId]);
  req.broadcast?.({ type: 'mural_updated', muralId: req.params.id });
  res.status(201).json(groupDto(created));
}));

// PUT /api/mural/groups/:id
router.put('/groups/:id', asyncRoute(async (req, res) => {
  const uid = userId(req);
  const group = await db.get('SELECT * FROM mural_groups WHERE id = $1', [req.params.id]);
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' });

  const access = await muralAccess(group.mural_id, uid, true);
  if (!access) return res.status(403).json({ error: 'Sem permissão para alterar o grupo' });

  const { title, color, position } = req.body;
  const updates = [];
  const params = [];
  let idx = 1;

  if (title !== undefined) {
    if (!title.trim()) return res.status(400).json({ error: 'Título inválido' });
    updates.push(`title = $${idx++}`);
    params.push(title.trim());
  }
  if (color !== undefined) {
    updates.push(`color = $${idx++}`);
    params.push(color);
  }
  if (position !== undefined) {
    updates.push(`position = $${idx++}`);
    params.push(Number(position));
  }

  if (updates.length) {
    params.push(req.params.id);
    await db.run(`UPDATE mural_groups SET ${updates.join(', ')} WHERE id = $${idx}`, params);
  }

  const updated = await db.get('SELECT * FROM mural_groups WHERE id = $1', [req.params.id]);
  req.broadcast?.({ type: 'mural_updated', muralId: group.mural_id });
  res.json(groupDto(updated));
}));

// DELETE /api/mural/groups/:id
router.delete('/groups/:id', asyncRoute(async (req, res) => {
  const uid = userId(req);
  const group = await db.get('SELECT * FROM mural_groups WHERE id = $1', [req.params.id]);
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' });

  const access = await muralAccess(group.mural_id, uid, true);
  if (!access) return res.status(403).json({ error: 'Sem permissão para excluir o grupo' });

  await db.transaction(async tx => {
    // Ungroup items instead of deleting them so user doesn't lose notes
    await tx.run('UPDATE mural_items SET group_id = NULL WHERE group_id = $1', [group.id]);
    await tx.run('DELETE FROM mural_groups WHERE id = $1', [group.id]);
  });

  req.broadcast?.({ type: 'mural_updated', muralId: group.mural_id });
  res.json({ success: true });
}));

// POST /api/mural/boards/:id/items
router.post('/boards/:id/items', asyncRoute(async (req, res) => {
  const uid = userId(req);
  const access = await muralAccess(req.params.id, uid, true);
  if (!access) return res.status(404).json({ error: 'Mural não encontrado ou sem permissão' });

  const { title, content = '', color = '#fef08a', groupId = null, isPinned = false, rotation, createdByName = '' } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Título é obrigatório' });

  const itemId = id('not');
  const now = new Date().toISOString();
  // Random subtle rotation between -1.5 and 1.5 if not provided
  const itemRotation = rotation !== undefined ? Number(rotation) : (Math.random() * 3 - 1.5).toFixed(1);

  const maxPos = await db.get('SELECT COALESCE(MAX(position), -1) as max_p FROM mural_items WHERE mural_id = $1', [req.params.id]);

  await db.run(`
    INSERT INTO mural_items (id, mural_id, group_id, title, content, color, is_pinned, position, rotation, created_by, created_by_name, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
  `, [itemId, req.params.id, groupId || null, title.trim(), content, color, isPinned ? 1 : 0, Number(maxPos.max_p) + 1, itemRotation, uid, createdByName, now]);

  const created = await db.get('SELECT * FROM mural_items WHERE id = $1', [itemId]);
  req.broadcast?.({ type: 'mural_updated', muralId: req.params.id, itemId });
  res.status(201).json(itemDto(created, []));
}));

// PUT /api/mural/items/:id
router.put('/items/:id', asyncRoute(async (req, res) => {
  const uid = userId(req);
  const item = await db.get('SELECT * FROM mural_items WHERE id = $1', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Nota não encontrada' });

  const access = await muralAccess(item.mural_id, uid, true);
  if (!access) return res.status(403).json({ error: 'Sem permissão para alterar a nota' });

  const { title, content, color, groupId, isPinned, position, rotation } = req.body;
  const updates = [];
  const params = [];
  let idx = 1;

  if (title !== undefined) {
    if (!title.trim()) return res.status(400).json({ error: 'Título inválido' });
    updates.push(`title = $${idx++}`);
    params.push(title.trim());
  }
  if (content !== undefined) {
    updates.push(`content = $${idx++}`);
    params.push(content);
  }
  if (color !== undefined) {
    updates.push(`color = $${idx++}`);
    params.push(color);
  }
  if (groupId !== undefined) {
    updates.push(`group_id = $${idx++}`);
    params.push(groupId || null);
  }
  if (isPinned !== undefined) {
    updates.push(`is_pinned = $${idx++}`);
    params.push(isPinned ? 1 : 0);
  }
  if (position !== undefined) {
    updates.push(`position = $${idx++}`);
    params.push(Number(position));
  }
  if (rotation !== undefined) {
    updates.push(`rotation = $${idx++}`);
    params.push(Number(rotation));
  }

  if (updates.length) {
    updates.push(`updated_at = $${idx++}`);
    params.push(new Date().toISOString());
    params.push(req.params.id);
    await db.run(`UPDATE mural_items SET ${updates.join(', ')} WHERE id = $${idx}`, params);
  }

  const updated = await db.get('SELECT * FROM mural_items WHERE id = $1', [req.params.id]);
  const attachments = await listAttachments('mural_item', updated.id);
  req.broadcast?.({ type: 'mural_updated', muralId: item.mural_id, itemId: item.id });
  res.json(itemDto(updated, attachments));
}));

// DELETE /api/mural/items/:id
router.delete('/items/:id', asyncRoute(async (req, res) => {
  const uid = userId(req);
  const item = await db.get('SELECT * FROM mural_items WHERE id = $1', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Nota não encontrada' });

  const access = await muralAccess(item.mural_id, uid, true);
  if (!access) return res.status(403).json({ error: 'Sem permissão para excluir a nota' });

  const atts = await db.all(`SELECT file_path FROM attachments WHERE owner_type = 'mural_item' AND owner_id = $1`, [item.id]);
  for (const att of atts) {
    if (att.file_path && fs.existsSync(att.file_path)) {
      try { await fs.promises.unlink(att.file_path); } catch {}
    }
  }
  await db.run(`DELETE FROM attachments WHERE owner_type = 'mural_item' AND owner_id = $1`, [item.id]);
  await db.run('DELETE FROM mural_items WHERE id = $1', [item.id]);

  req.broadcast?.({ type: 'mural_updated', muralId: item.mural_id, itemId: item.id });
  res.json({ success: true });
}));

// POST /api/mural/teams/:teamId/members — Adicionar membro ao time
router.post('/teams/:teamId/members', asyncRoute(async (req, res) => {
  const uid = userId(req);
  const { teamId } = req.params;
  const { userId: targetUserId, role = 'member' } = req.body;

  if (!targetUserId) return res.status(400).json({ error: 'userId é obrigatório' });

  // Verifica se o solicitante é admin do time
  const requester = await db.get('SELECT role FROM kanban_team_members WHERE team_id = $1 AND user_id = $2', [teamId, uid]);
  if (!requester || requester.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem adicionar membros' });

  const existing = await db.get('SELECT id FROM kanban_team_members WHERE team_id = $1 AND user_id = $2', [teamId, targetUserId]);
  if (existing) return res.status(409).json({ error: 'Usuário já é membro do time' });

  const memberId = id('tmb');
  const now = new Date().toISOString();
  await db.run('INSERT INTO kanban_team_members (id, team_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4, $5)',
    [memberId, teamId, targetUserId, role === 'admin' ? 'admin' : 'member', now]);

  req.broadcast?.({ type: 'mural_updated' });
  res.status(201).json({ success: true, memberId });
}));

// DELETE /api/mural/teams/:teamId/members/:memberId — Remover membro do time
router.delete('/teams/:teamId/members/:memberId', asyncRoute(async (req, res) => {
  const uid = userId(req);
  const { teamId, memberId } = req.params;

  // Verifica se o solicitante é admin do time
  const requester = await db.get('SELECT role FROM kanban_team_members WHERE team_id = $1 AND user_id = $2', [teamId, uid]);
  if (!requester || requester.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem remover membros' });

  await db.run('DELETE FROM kanban_team_members WHERE team_id = $1 AND user_id = $2', [teamId, memberId]);

  req.broadcast?.({ type: 'mural_updated' });
  res.json({ success: true });
}));

router.ensurePersonalMural = ensurePersonalMural;
router.ensureTeamMural = ensureTeamMural;
router.muralAccess = muralAccess;
router.muralDto = muralDto;
router.groupDto = groupDto;
router.itemDto = itemDto;

module.exports = router;
