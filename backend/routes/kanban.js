const express = require('express');
const router = express.Router();
const db = require('../db');
const asyncRoute = require('../async-route');
const { isHexColor, isNonEmptyString, isOptionalString, validateTaskInput, AUTO_ARCHIVE_DELAYS } = require('../validation');
const { listAttachments } = require('./attachments');

const id = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const userId = req => String(req.headers['x-user-id'] || '');
const parseJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

async function boardAccess(boardId, uid, write = false) {
  const board = await db.get('SELECT * FROM kanban_boards WHERE id = $1', [boardId]);
  if (!board) return null;
  if (board.scope_type !== 'team') return board.owner_id === uid ? { board, role: 'admin' } : null;
  const member = await db.get('SELECT role FROM kanban_team_members WHERE team_id = $1 AND user_id = $2', [board.team_id, uid]);
  if (!member || (write && !['admin', 'member'].includes(member.role))) return null;
  return { board, role: member.role };
}

async function teamAccess(teamId, uid, admin = false) {
  const team = await db.get('SELECT * FROM kanban_teams WHERE id = $1', [teamId]);
  if (!team) return null;
  const member = await db.get('SELECT * FROM kanban_team_members WHERE team_id = $1 AND user_id = $2', [teamId, uid]);
  if (!member || (admin && member.role !== 'admin')) return null;
  return { team, member };
}

async function validAssignees(board, assigneeIds) {
  if (!Array.isArray(assigneeIds)) return false;
  if (board.scope_type !== 'team') return assigneeIds.every(uid => uid === board.owner_id);
  const checks = await Promise.all(assigneeIds.map(uid =>
    db.get('SELECT 1 FROM kanban_team_members WHERE team_id = $1 AND user_id = $2', [board.team_id, uid])));
  return checks.every(Boolean);
}

function columnDto(column) {
  if (!column) return null;
  return {
    ...column,
    boardId: column.board_id,
    autoArchiveDelay: column.auto_archive_delay || 'never',
    auto_archive_delay: column.auto_archive_delay || 'never',
  };
}

function taskDto(task, attachments = []) {
  const assigneeIds = parseJson(task.assignee_ids || '[]', []);
  if (!assigneeIds.length && task.assignee_id) assigneeIds.push(task.assignee_id);
  return {
    ...task,
    boardId: task.board_id,
    columnId: task.column_id,
    parentTaskId: task.parent_task_id || null,
    dueDate: task.due_date,
    assigneeId: task.assignee_id,
    assigneeIds,
    createdBy: task.created_by,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    columnEnteredAt: task.column_entered_at || task.created_at,
    deletedAt: task.deleted_at || null,
    deletedBy: task.deleted_by || null,
    labels: parseJson(task.labels || '[]', []),
    checklist: parseJson(task.checklist || '[]', []),
    color: task.color || null,
    archived: task.archived === 1,
    attachments,
  };
}

function boardDto(board, role) {
  return { ...board, scopeType: board.scope_type || 'personal', teamId: board.team_id || null, myRole: role };
}

async function createBoard({ name, description = '', color = '#4f46e5', ownerId, scopeType = 'personal', teamId = null }, store = db) {
  const boardId = id('brd');
  const now = new Date().toISOString();
  await store.run(`INSERT INTO kanban_boards
    (id, name, description, color, owner_id, created_at, updated_at, scope_type, team_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [boardId, name, description, color, ownerId, now, now, scopeType, teamId]);
  const defaults = [['A fazer', '#64748b'], ['Em andamento', '#f59e0b'], ['Concluído', '#10b981']];
  for (const [position, [title, columnColor]] of defaults.entries()) {
    await store.run('INSERT INTO kanban_columns (id, board_id, title, color, position, auto_archive_delay, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id('col'), boardId, title, columnColor, position, 'never', now]);
  }
  return store.get('SELECT * FROM kanban_boards WHERE id = $1', [boardId]);
}

async function createDefaultPersonalBoard(uid) {
  try {
    const dismissed = await db.get("SELECT 1 FROM user_preferences WHERE user_id = $1 AND key = 'kanban_personal_deleted' AND value = '1'", [uid]);
    if (dismissed) return null;
  } catch {}
  const existing = await db.get("SELECT * FROM kanban_boards WHERE owner_id = $1 AND COALESCE(scope_type, 'personal') = 'personal' ORDER BY created_at LIMIT 1", [uid]);
  return existing || createBoard({ name: 'Meu Kanban', description: 'Meu espaço pessoal de tarefas', ownerId: uid });
}

async function ensureDefaultCalendar(uid, broadcast) {
  let calendar = await db.get('SELECT * FROM calendars WHERE owner_id = $1 AND is_default = 1 ORDER BY created_at LIMIT 1', [uid]);
  if (calendar) return calendar;
  const calendarId = id('cal');
  const now = new Date().toISOString();
  await db.transaction(async tx => {
    await tx.get('SELECT pg_advisory_xact_lock(hashtext($1))', [`default-calendar:${uid}`]);
    calendar = await tx.get('SELECT * FROM calendars WHERE owner_id = $1 AND is_default = 1 ORDER BY created_at LIMIT 1', [uid]);
    if (calendar) return;
    await tx.run('INSERT INTO calendars (id, name, color, is_private, owner_id, is_default, created_at) VALUES ($1, $2, $3, 1, $4, 1, $5)',
      [calendarId, 'Minha Agenda', '#4f46e5', uid, now]);
    await tx.run('INSERT INTO calendar_members (id, calendar_id, user_id, permission) VALUES ($1, $2, $3, $4)',
      [id('mbr'), calendarId, uid, 'owner']);
    calendar = await tx.get('SELECT * FROM calendars WHERE id = $1', [calendarId]);
  });
  if (calendar?.id === calendarId) broadcast({ type: 'calendar_created', calendarId, userId: uid });
  return calendar;
}

async function createTeamCalendar(team, store = db) {
  const calendarId = id('cal');
  const now = new Date().toISOString();
  await store.run(`INSERT INTO calendars
    (id, name, color, is_private, owner_id, is_default, is_task_calendar, created_at)
    VALUES ($1, 'Tarefas', $2, 0, $3, 0, 1, $4)`,
    [calendarId, team.color || '#4f46e5', team.owner_id, now]);
  await store.run('UPDATE kanban_teams SET calendar_id = $1 WHERE id = $2', [calendarId, team.id]);
  const members = await store.all('SELECT user_id, role FROM kanban_team_members WHERE team_id = $1', [team.id]);
  for (const member of members) {
    const permission = member.user_id === team.owner_id ? 'owner' : 'editor';
    await store.run(`INSERT INTO calendar_members (id, calendar_id, user_id, permission)
      VALUES ($1, $2, $3, $4) ON CONFLICT (calendar_id, user_id) DO UPDATE SET permission = excluded.permission`,
      [id('mbr'), calendarId, member.user_id, permission]);
  }
  return store.get('SELECT * FROM calendars WHERE id = $1', [calendarId]);
}

async function ensureTeamCalendar(teamId, broadcast) {
  let calendar;
  let created = false;
  let membersAdded = 0;
  await db.transaction(async tx => {
    await tx.get('SELECT pg_advisory_xact_lock(hashtext($1))', [`team-calendar:${teamId}`]);
    const team = await tx.get('SELECT * FROM kanban_teams WHERE id = $1', [teamId]);
    if (!team) return;
    calendar = team.calendar_id
      ? await tx.get('SELECT * FROM calendars WHERE id = $1', [team.calendar_id])
      : null;
    if (!calendar) {
      calendar = await createTeamCalendar(team, tx);
      created = true;
      return;
    }

    await tx.run(`UPDATE calendars SET name = 'Tarefas', color = $1, is_private = 0, is_task_calendar = 1 WHERE id = $2`,
      [team.color || '#4f46e5', calendar.id]);
    calendar = await tx.get('SELECT * FROM calendars WHERE id = $1', [calendar.id]);

    const members = await tx.all('SELECT user_id FROM kanban_team_members WHERE team_id = $1', [team.id]);
    for (const member of members) {
      const permission = member.user_id === team.owner_id ? 'owner' : 'editor';
      const result = await tx.run(`INSERT INTO calendar_members (id, calendar_id, user_id, permission)
        VALUES ($1, $2, $3, $4) ON CONFLICT (calendar_id, user_id) DO NOTHING`,
        [id('mbr'), calendar.id, member.user_id, permission]);
      membersAdded += result.rowCount || 0;
    }
  });
  if (calendar && created) broadcast({ type: 'calendar_created', calendarId: calendar.id });
  else if (calendar && membersAdded) broadcast({ type: 'calendar_updated', calendarId: calendar.id });
  return calendar;
}

async function syncTaskCalendarEvents(taskId, broadcast) {
  const task = await db.get(`SELECT kt.*, kb.scope_type, kb.team_id
    FROM kanban_tasks kt JOIN kanban_boards kb ON kb.id = kt.board_id
    WHERE kt.id = $1`, [taskId]);
  if (!task) return;
  const targets = new Map();
  if (!task.deleted_at && !task.archived && task.due_date && task.scope_type === 'team' && task.team_id) {
    const calendar = await ensureTeamCalendar(task.team_id, broadcast);
    if (calendar) targets.set(`team:${task.team_id}`, calendar);
  } else if (!task.deleted_at && !task.archived && task.due_date) {
    let responsibleIds = parseJson(task.assignee_ids || '[]', []);
    if (!responsibleIds.length && task.assignee_id) responsibleIds = [task.assignee_id];
    if (!responsibleIds.length && task.created_by) responsibleIds = [task.created_by];
    for (const uid of responsibleIds.filter(Boolean)) {
      targets.set(uid, await ensureDefaultCalendar(uid, broadcast));
    }
  }
  const desired = new Set(targets.keys());
  const links = await db.all('SELECT * FROM kanban_task_events WHERE task_id = $1', [task.id]);

  for (const link of links) {
    if (desired.has(link.user_id)) continue;
    await db.transaction(async tx => {
      await tx.run('DELETE FROM events WHERE id = $1', [link.event_id]);
      await tx.run('DELETE FROM kanban_task_events WHERE id = $1', [link.id]);
    });
    broadcast({ type: 'event_deleted', calendarId: link.calendar_id, eventId: link.event_id });
  }

  for (const targetKey of desired) {
    const existing = links.find(link => link.user_id === targetKey);
    const description = task.description ? `Prazo da tarefa Kanban.\n\n${task.description}` : 'Prazo da tarefa Kanban.';
    if (existing) {
      await db.run(`UPDATE events SET title = $1, description = $2, date = $3, end_date = $4, all_day = 1,
        category = 'Tarefas', updated_at = $5 WHERE id = $6`, [`📋 ${task.title}`, description, task.due_date, task.due_date, new Date().toISOString(), existing.event_id]);
      broadcast({ type: 'event_updated', calendarId: existing.calendar_id, eventId: existing.event_id });
      continue;
    }

    const calendar = targets.get(targetKey);
    if (!calendar) continue;
    const eventId = id('evt');
    const now = new Date().toISOString();
    await db.transaction(async tx => {
      await tx.run(`INSERT INTO events (id, calendar_id, title, description, date, end_date, start_time, end_time,
        day_times, color, category, all_day, created_by, copy_group_id, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, '00:00', '23:59', '{}', 'indigo', 'Tarefas', 1, $7, $8, $9)`,
        [eventId, calendar.id, `📋 ${task.title}`, description, task.due_date, task.due_date, task.created_by, `kanban-${task.id}`, now]);
      await tx.run('INSERT INTO kanban_task_events (id, task_id, event_id, user_id, calendar_id) VALUES ($1, $2, $3, $4, $5)',
        [id('kte'), task.id, eventId, targetKey, calendar.id]);
    });
    broadcast({ type: 'event_created', calendarId: calendar.id, eventId });
  }
}

async function deleteTaskCalendarEvents(taskId, broadcast) {
  const links = await db.all('SELECT * FROM kanban_task_events WHERE task_id = $1', [taskId]);
  for (const link of links) {
    await db.transaction(async tx => {
      await tx.run('DELETE FROM events WHERE id = $1', [link.event_id]);
      await tx.run('DELETE FROM kanban_task_events WHERE id = $1', [link.id]);
    });
    broadcast({ type: 'event_deleted', calendarId: link.calendar_id, eventId: link.event_id });
  }
}

async function deleteBoardCalendarEvents(boardId, broadcast) {
  const tasks = await db.all('SELECT id FROM kanban_tasks WHERE board_id = $1', [boardId]);
  for (const task of tasks) await deleteTaskCalendarEvents(task.id, broadcast);
}

async function taskDescendants(taskId) {
  return db.all(`WITH RECURSIVE tree(id) AS (
    SELECT id FROM kanban_tasks WHERE parent_task_id = $1
    UNION ALL SELECT t.id FROM kanban_tasks t JOIN tree ON t.parent_task_id = tree.id
  ) SELECT id FROM tree`, [taskId]);
}

async function permanentlyDeleteTaskTree(task, broadcast = () => {}) {
  const descendants = await taskDescendants(task.id);
  const allTasks = [task, ...descendants];
  for (const item of allTasks) await deleteTaskCalendarEvents(item.id, broadcast);
  await db.transaction(async tx => {
    for (const item of [...allTasks].reverse()) {
      await tx.run(`DELETE FROM attachments WHERE owner_type = 'task' AND owner_id = $1`, [item.id]);
      await tx.run('DELETE FROM kanban_tasks WHERE id = $1', [item.id]);
    }
  });
  return descendants.length;
}

async function purgeExpiredTrash(broadcast = () => {}) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const expiredRoots = await db.all(`SELECT t.* FROM kanban_tasks t
    WHERE t.deleted_at IS NOT NULL AND t.deleted_at <= $1
      AND (t.parent_task_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM kanban_tasks parent WHERE parent.id = t.parent_task_id AND parent.deleted_at IS NOT NULL
      ))`, [cutoff]);
  for (const task of expiredRoots) {
    await permanentlyDeleteTaskTree(task, broadcast);
    broadcast({ type: 'kanban_updated', boardId: task.board_id, taskId: task.id });
  }
  return expiredRoots.length;
}

async function autoArchiveColumnTasks(boardId = null, broadcast = () => {}) {
  try {
    const query = `
      SELECT kt.id, kt.board_id, kt.column_id, kt.column_entered_at, kt.updated_at, kt.created_at, kc.auto_archive_delay
      FROM kanban_tasks kt
      JOIN kanban_columns kc ON kc.id = kt.column_id
      WHERE kt.archived = 0
        AND kt.deleted_at IS NULL
        AND kc.auto_archive_delay IS NOT NULL
        AND kc.auto_archive_delay != 'never'
        ${boardId ? 'AND kt.board_id = $1' : ''}
    `;
    const tasks = await db.all(query, boardId ? [boardId] : []);
    if (!tasks || !tasks.length) return 0;

    const parseDelayMs = (delay) => {
      if (!delay || delay === 'never') return null;
      if (delay === 'immediate' || delay === '0' || delay === '0m') return 0;
      if (delay === '1h') return 1 * 60 * 60 * 1000;
      if (delay === '6h') return 6 * 60 * 60 * 1000;
      if (delay === '12h') return 12 * 60 * 60 * 1000;
      if (delay === '24h' || delay === '1d') return 24 * 60 * 60 * 1000;
      if (delay === '48h' || delay === '2d') return 48 * 60 * 60 * 1000;
      if (delay === '72h' || delay === '3d') return 72 * 60 * 60 * 1000;
      if (delay === '7d') return 7 * 24 * 60 * 60 * 1000;
      const num = Number(delay);
      if (!Number.isNaN(num) && num >= 0) return num * 60 * 1000;
      return null;
    };

    const nowMs = Date.now();
    const toArchive = [];
    for (const task of tasks) {
      const delayMs = parseDelayMs(task.auto_archive_delay);
      if (delayMs === null) continue;
      const enteredAtStr = task.column_entered_at || task.updated_at || task.created_at;
      const enteredMs = new Date(enteredAtStr).getTime();
      if (Number.isNaN(enteredMs)) continue;
      if (nowMs - enteredMs >= delayMs) {
        toArchive.push(task);
      }
    }

    if (!toArchive.length) return 0;

    const now = new Date().toISOString();
    const boardsAffected = new Set();
    await db.transaction(async tx => {
      for (const task of toArchive) {
        await tx.run('UPDATE kanban_tasks SET archived = 1, updated_at = $1 WHERE id = $2', [now, task.id]);
        boardsAffected.add(task.board_id);
      }
    });

    for (const task of toArchive) {
      await syncTaskCalendarEvents(task.id, broadcast);
    }

    for (const bId of boardsAffected) {
      broadcast({ type: 'kanban_updated', boardId: bId });
    }

    return toArchive.length;
  } catch (err) {
    console.error('[KANBAN] Erro no auto-arquivamento:', err.message);
    return 0;
  }
}

router.use((req, res, next) => {
  if (!userId(req)) return res.status(400).json({ error: 'x-user-id header obrigatório' });
  next();
});

router.get('/teams', asyncRoute(async (req, res) => {
  let teams = await db.all(`SELECT t.*, tm.role AS my_role,
    (SELECT COUNT(*) FROM kanban_team_members x WHERE x.team_id = t.id) member_count,
    (SELECT id FROM kanban_boards b WHERE b.team_id = t.id LIMIT 1) board_id
    FROM kanban_teams t JOIN kanban_team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = $1 ORDER BY t.created_at`, [userId(req)]);
  for (const team of teams) {
    if (!team.calendar_id) await ensureTeamCalendar(team.id, req.broadcast);
  }
  if (teams.some(team => !team.calendar_id)) {
    teams = await db.all(`SELECT t.*, tm.role AS my_role,
      (SELECT COUNT(*) FROM kanban_team_members x WHERE x.team_id = t.id) member_count,
      (SELECT id FROM kanban_boards b WHERE b.team_id = t.id LIMIT 1) board_id
      FROM kanban_teams t JOIN kanban_team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = $1 ORDER BY t.created_at`, [userId(req)]);
  }
  res.json(teams.map(team => ({ ...team, myRole: team.my_role, memberCount: Number(team.member_count), boardId: team.board_id })));
}));

router.post('/teams', asyncRoute(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!isNonEmptyString(name, 80)) return res.status(400).json({ error: 'Nome do time inválido (máximo de 80 caracteres)' });
  if (!isOptionalString(req.body.description, 1000)) return res.status(400).json({ error: 'Descrição inválida' });
  if (req.body.color !== undefined && !isHexColor(req.body.color)) return res.status(400).json({ error: 'Cor inválida' });
  const uid = userId(req);
  const teamId = id('team');
  const now = new Date().toISOString();
  const color = req.body.color || '#4f46e5';
  let board;
  let calendar;
  await db.transaction(async tx => {
    await tx.run('INSERT INTO kanban_teams (id, name, description, color, owner_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [teamId, name, req.body.description || '', color, uid, now, now]);
    await tx.run('INSERT INTO kanban_team_members (id, team_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4, $5)',
      [id('tm'), teamId, uid, 'admin', now]);
    calendar = await createTeamCalendar({ id: teamId, name, color, owner_id: uid }, tx);
    board = await createBoard({ name: `Kanban · ${name}`, description: `Quadro compartilhado do time ${name}`, color, ownerId: uid, scopeType: 'team', teamId }, tx);
  });
  req.broadcast({ type: 'kanban_team_updated', teamId, userId: uid });
  req.broadcast({ type: 'calendar_created', calendarId: calendar.id, userId: uid });
  const team = await db.get('SELECT * FROM kanban_teams WHERE id = $1', [teamId]);
  res.status(201).json({ ...team, myRole: 'admin', memberCount: 1, boardId: board.id });
}));

router.put('/teams/:teamId', asyncRoute(async (req, res) => {
  const access = await teamAccess(req.params.teamId, userId(req), true);
  if (!access) return res.status(403).json({ error: 'Somente o administrador pode editar o time' });
  const now = new Date().toISOString();
  if (req.body.name !== undefined && !isNonEmptyString(req.body.name, 80)) return res.status(400).json({ error: 'Nome do time inválido' });
  if (!isOptionalString(req.body.description, 1000)) return res.status(400).json({ error: 'Descrição inválida' });
  if (req.body.color !== undefined && !isHexColor(req.body.color)) return res.status(400).json({ error: 'Cor inválida' });
  if (req.body.name !== undefined) await db.run('UPDATE kanban_teams SET name = $1, updated_at = $2 WHERE id = $3', [String(req.body.name).trim(), now, access.team.id]);
  if (req.body.description !== undefined) await db.run('UPDATE kanban_teams SET description = $1, updated_at = $2 WHERE id = $3', [req.body.description, now, access.team.id]);
  if (req.body.color !== undefined) await db.run('UPDATE kanban_teams SET color = $1, updated_at = $2 WHERE id = $3', [req.body.color, now, access.team.id]);
  const calendar = await ensureTeamCalendar(access.team.id, req.broadcast);
  if (calendar) {
    if (req.body.color !== undefined) await db.run('UPDATE calendars SET color = $1 WHERE id = $2', [req.body.color, calendar.id]);
    if (req.body.name !== undefined || req.body.color !== undefined) req.broadcast({ type: 'calendar_updated', calendarId: calendar.id });
  }
  req.broadcast({ type: 'kanban_team_updated', teamId: access.team.id });
  res.json(await db.get('SELECT * FROM kanban_teams WHERE id = $1', [access.team.id]));
}));

router.delete('/teams/:teamId', asyncRoute(async (req, res) => {
  const access = await teamAccess(req.params.teamId, userId(req), true);
  if (!access) return res.status(403).json({ error: 'Somente o administrador pode excluir o time' });
  const boards = await db.all('SELECT id FROM kanban_boards WHERE team_id = $1', [access.team.id]);
  const calendar = access.team.calendar_id ? await db.get('SELECT * FROM calendars WHERE id = $1', [access.team.calendar_id]) : null;
  for (const board of boards) await deleteBoardCalendarEvents(board.id, req.broadcast);
  await db.transaction(async tx => {
    for (const board of boards) {
      await tx.run('DELETE FROM kanban_tasks WHERE board_id = $1', [board.id]);
      await tx.run('DELETE FROM kanban_columns WHERE board_id = $1', [board.id]);
    }
    await tx.run('DELETE FROM kanban_boards WHERE team_id = $1', [access.team.id]);
    await tx.run('DELETE FROM kanban_team_invitations WHERE team_id = $1', [access.team.id]);
    await tx.run('DELETE FROM kanban_team_members WHERE team_id = $1', [access.team.id]);
    if (calendar) {
      await tx.run('DELETE FROM calendar_invitations WHERE calendar_id = $1', [calendar.id]);
      await tx.run('DELETE FROM calendar_members WHERE calendar_id = $1', [calendar.id]);
      await tx.run('DELETE FROM events WHERE calendar_id = $1', [calendar.id]);
      await tx.run('DELETE FROM calendars WHERE id = $1', [calendar.id]);
    }
    await tx.run('DELETE FROM kanban_teams WHERE id = $1', [access.team.id]);
  });
  req.broadcast({ type: 'kanban_team_updated', teamId: access.team.id });
  if (calendar) req.broadcast({ type: 'calendar_deleted', calendarId: calendar.id });
  res.json({ success: true });
}));

router.get('/teams/:teamId/members', asyncRoute(async (req, res) => {
  const access = await teamAccess(req.params.teamId, userId(req));
  if (!access) return res.status(403).json({ error: 'Sem acesso ao time' });
  res.json(await db.all('SELECT * FROM kanban_team_members WHERE team_id = $1 ORDER BY role, joined_at', [access.team.id]));
}));

router.post('/teams/:teamId/invitations', asyncRoute(async (req, res) => {
  const access = await teamAccess(req.params.teamId, userId(req), true);
  if (!access) return res.status(403).json({ error: 'Somente o administrador pode convidar pessoas' });
  const invitedUser = String(req.body.userId || '');
  if (!invitedUser || invitedUser === userId(req)) return res.status(400).json({ error: 'Selecione outro usuário' });
  if (await db.get('SELECT 1 FROM kanban_team_members WHERE team_id = $1 AND user_id = $2', [access.team.id, invitedUser])) {
    return res.status(409).json({ error: 'Usuário já faz parte do time' });
  }
  await db.run(`INSERT INTO kanban_team_invitations (id, team_id, user_id, invited_by, status, created_at)
    VALUES ($1, $2, $3, $4, 'pending', $5) ON CONFLICT(team_id, user_id) DO UPDATE SET
    invited_by = excluded.invited_by, status = 'pending', created_at = excluded.created_at`,
    [id('tinv'), access.team.id, invitedUser, userId(req), new Date().toISOString()]);
  req.broadcast({ type: 'kanban_team_invited', teamId: access.team.id, userId: invitedUser });
  res.status(201).json({ success: true });
}));

router.delete('/teams/:teamId/members/:memberId', asyncRoute(async (req, res) => {
  const access = await teamAccess(req.params.teamId, userId(req), true);
  if (!access) return res.status(403).json({ error: 'Somente o administrador pode remover pessoas' });
  const member = await db.get('SELECT * FROM kanban_team_members WHERE id = $1 AND team_id = $2', [req.params.memberId, access.team.id]);
  if (!member) return res.status(404).json({ error: 'Membro não encontrado' });
  // Impede remoção do dono original do time
  if (member.user_id === access.team.owner_id) return res.status(400).json({ error: 'O criador do time não pode ser removido' });
  const calendar = await ensureTeamCalendar(access.team.id, req.broadcast);
  await db.transaction(async tx => {
    await tx.run('DELETE FROM kanban_team_members WHERE id = $1', [member.id]);
    if (calendar) await tx.run('DELETE FROM calendar_members WHERE calendar_id = $1 AND user_id = $2', [calendar.id, member.user_id]);
  });
  const tasks = await db.all('SELECT kt.* FROM kanban_tasks kt JOIN kanban_boards kb ON kb.id = kt.board_id WHERE kb.team_id = $1', [access.team.id]);
  for (const task of tasks) {
    const assignees = parseJson(task.assignee_ids || '[]', []).filter(uid => uid !== member.user_id);
    await db.run('UPDATE kanban_tasks SET assignee_ids = $1, assignee_id = $2, updated_at = $3 WHERE id = $4',
      [JSON.stringify(assignees), assignees[0] || null, new Date().toISOString(), task.id]);
    await syncTaskCalendarEvents(task.id, req.broadcast);
  }
  req.broadcast({ type: 'kanban_team_updated', teamId: access.team.id, userId: member.user_id });
  if (calendar) req.broadcast({ type: 'member_removed', calendarId: calendar.id, userId: member.user_id });
  res.json({ success: true });
}));

// Alterar role de um membro (promover/rebaixar)
router.put('/teams/:teamId/members/:memberId/role', asyncRoute(async (req, res) => {
  const access = await teamAccess(req.params.teamId, userId(req), true);
  if (!access) return res.status(403).json({ error: 'Somente o administrador pode alterar roles' });
  const role = String(req.body.role || '');
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Role inválido. Use admin ou member' });
  const member = await db.get('SELECT * FROM kanban_team_members WHERE id = $1 AND team_id = $2', [req.params.memberId, access.team.id]);
  if (!member) return res.status(404).json({ error: 'Membro não encontrado' });
  // Impede rebaixar o dono original
  if (member.user_id === access.team.owner_id && role !== 'admin') return res.status(400).json({ error: 'O criador do time deve manter o role de admin' });
  await db.run('UPDATE kanban_team_members SET role = $1 WHERE id = $2', [role, member.id]);
  req.broadcast({ type: 'kanban_team_updated', teamId: access.team.id });
  res.json({ success: true, role });
}));

router.get('/team-invitations', asyncRoute(async (req, res) => {
  res.json(await db.all(`SELECT i.*, t.name AS team_name, t.color AS team_color
    FROM kanban_team_invitations i JOIN kanban_teams t ON t.id = i.team_id
    WHERE i.user_id = $1 AND i.status = 'pending' ORDER BY i.created_at`, [userId(req)]));
}));

router.put('/team-invitations/:invitationId', asyncRoute(async (req, res) => {
  const invitation = await db.get("SELECT * FROM kanban_team_invitations WHERE id = $1 AND user_id = $2 AND status = 'pending'",
    [req.params.invitationId, userId(req)]);
  if (!invitation) return res.status(404).json({ error: 'Convite não encontrado' });
  const accepted = req.body.accept === true;
  const calendar = accepted ? await ensureTeamCalendar(invitation.team_id, req.broadcast) : null;
  await db.transaction(async tx => {
    if (accepted) {
      await tx.run('INSERT INTO kanban_team_members (id, team_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (team_id, user_id) DO NOTHING',
        [id('tm'), invitation.team_id, userId(req), 'member', new Date().toISOString()]);
      if (calendar) await tx.run(`INSERT INTO calendar_members (id, calendar_id, user_id, permission)
        VALUES ($1, $2, $3, 'editor') ON CONFLICT (calendar_id, user_id) DO UPDATE SET permission = 'editor'`,
        [id('mbr'), calendar.id, userId(req)]);
    }
    await tx.run('UPDATE kanban_team_invitations SET status = $1 WHERE id = $2', [accepted ? 'accepted' : 'declined', invitation.id]);
  });
  req.broadcast({ type: accepted ? 'kanban_team_joined' : 'kanban_team_declined', teamId: invitation.team_id, userId: userId(req) });
  if (accepted && calendar) req.broadcast({ type: 'member_added', calendarId: calendar.id, userId: userId(req) });
  res.json({ success: true, accepted });
}));

router.get('/boards', asyncRoute(async (req, res) => {
  await createDefaultPersonalBoard(userId(req));
  const rows = await db.all(`SELECT DISTINCT b.*,
    CASE WHEN b.scope_type = 'team' THEN tm.role ELSE 'admin' END AS my_role,
    t.name AS team_name,
    (SELECT COUNT(*) FROM kanban_tasks x WHERE x.board_id = b.id AND x.archived = 0 AND x.deleted_at IS NULL) task_count,
    (SELECT COUNT(*) FROM kanban_tasks x WHERE x.board_id = b.id AND x.deleted_at IS NOT NULL
      AND (x.parent_task_id IS NULL OR NOT EXISTS (SELECT 1 FROM kanban_tasks p WHERE p.id = x.parent_task_id AND p.deleted_at IS NOT NULL))) trash_count
    FROM kanban_boards b
    LEFT JOIN kanban_team_members tm ON tm.team_id = b.team_id AND tm.user_id = $1
    LEFT JOIN kanban_teams t ON t.id = b.team_id
    WHERE (COALESCE(b.scope_type, 'personal') = 'personal' AND b.owner_id = $2)
       OR (b.scope_type = 'team' AND tm.user_id = $3)
    ORDER BY b.scope_type, b.created_at`, [userId(req), userId(req), userId(req)]);
  res.json(rows.map(row => ({ ...boardDto(row, row.my_role), teamName: row.team_name,
    taskCount: Number(row.task_count), trashCount: Number(row.trash_count) })));
}));

router.post('/boards', asyncRoute(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!isNonEmptyString(name, 80)) return res.status(400).json({ error: 'Nome inválido (máximo de 80 caracteres)' });
  if (!isOptionalString(req.body.description, 1000)) return res.status(400).json({ error: 'Descrição inválida' });
  if (req.body.color !== undefined && !isHexColor(req.body.color)) return res.status(400).json({ error: 'Cor inválida' });
  const board = await db.transaction(tx => createBoard({ name, description: req.body.description, color: req.body.color, ownerId: userId(req) }, tx));
  try {
    await db.run("DELETE FROM user_preferences WHERE user_id = $1 AND key = 'kanban_personal_deleted'", [userId(req)]);
  } catch {}
  req.broadcast({ type: 'kanban_updated', boardId: board.id });
  res.status(201).json(boardDto(board, 'admin'));
}));

router.get('/boards/:boardId', asyncRoute(async (req, res) => {
  const access = await boardAccess(req.params.boardId, userId(req));
  if (!access) return res.status(404).json({ error: 'Quadro não encontrado' });
  await autoArchiveColumnTasks(access.board.id, req.broadcast);
  const columnRows = await db.all('SELECT * FROM kanban_columns WHERE board_id = $1 ORDER BY position, created_at', [access.board.id]);
  const columns = columnRows.map(columnDto);
  const taskRows = await db.all('SELECT * FROM kanban_tasks WHERE board_id = $1 AND deleted_at IS NULL ORDER BY parent_task_id, column_id, position, created_at', [access.board.id]);
  const tasks = await Promise.all(taskRows.map(async task => taskDto(task, await listAttachments('task', task.id))));
  const trash = await db.get(`SELECT COUNT(*) trash_count FROM kanban_tasks t WHERE t.board_id = $1 AND t.deleted_at IS NOT NULL
    AND (t.parent_task_id IS NULL OR NOT EXISTS (SELECT 1 FROM kanban_tasks parent WHERE parent.id = t.parent_task_id AND parent.deleted_at IS NOT NULL))`, [access.board.id]);
  res.json({ ...boardDto(access.board, access.role), columns, tasks, trashCount: Number(trash?.trash_count || 0) });
}));

router.get('/boards/:boardId/trash', asyncRoute(async (req, res) => {
  const access = await boardAccess(req.params.boardId, userId(req));
  if (!access) return res.status(404).json({ error: 'Quadro não encontrado' });
  await purgeExpiredTrash(req.broadcast);
  const rows = await db.all(`SELECT t.* FROM kanban_tasks t
    WHERE t.board_id = $1 AND t.deleted_at IS NOT NULL
      AND (t.parent_task_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM kanban_tasks parent WHERE parent.id = t.parent_task_id AND parent.deleted_at IS NOT NULL
      )) ORDER BY t.deleted_at DESC`, [access.board.id]);
  const tasks = await Promise.all(rows.map(async task => taskDto(task, await listAttachments('task', task.id))));
  res.json(tasks);
}));

router.put('/boards/:boardId', asyncRoute(async (req, res) => {
  const access = await boardAccess(req.params.boardId, userId(req), true);
  if (!access) return res.status(403).json({ error: 'Sem permissão' });
  const now = new Date().toISOString();
  if (req.body.name !== undefined && !isNonEmptyString(req.body.name, 80)) return res.status(400).json({ error: 'Nome inválido' });
  if (!isOptionalString(req.body.description, 1000)) return res.status(400).json({ error: 'Descrição inválida' });
  if (req.body.color !== undefined && !isHexColor(req.body.color)) return res.status(400).json({ error: 'Cor inválida' });
  if (req.body.name !== undefined) await db.run('UPDATE kanban_boards SET name = $1, updated_at = $2 WHERE id = $3', [String(req.body.name).trim(), now, access.board.id]);
  if (req.body.description !== undefined) await db.run('UPDATE kanban_boards SET description = $1, updated_at = $2 WHERE id = $3', [req.body.description, now, access.board.id]);
  if (req.body.color !== undefined) await db.run('UPDATE kanban_boards SET color = $1, updated_at = $2 WHERE id = $3', [req.body.color, now, access.board.id]);
  req.broadcast({ type: 'kanban_updated', boardId: access.board.id });
  res.json(boardDto(await db.get('SELECT * FROM kanban_boards WHERE id = $1', [access.board.id]), access.role));
}));

router.delete('/boards/:boardId', asyncRoute(async (req, res) => {
  const access = await boardAccess(req.params.boardId, userId(req));
  if (!access || access.board.scope_type === 'team' || access.board.owner_id !== userId(req)) return res.status(403).json({ error: 'Quadros de time são excluídos junto com o time' });
  await deleteBoardCalendarEvents(access.board.id, req.broadcast);
  await db.transaction(async tx => {
    await tx.run(`DELETE FROM attachments WHERE owner_type = 'task' AND owner_id IN
      (SELECT id FROM kanban_tasks WHERE board_id = $1)`, [access.board.id]);
    await tx.run('DELETE FROM kanban_tasks WHERE board_id = $1', [access.board.id]);
    await tx.run('DELETE FROM kanban_columns WHERE board_id = $1', [access.board.id]);
    await tx.run('DELETE FROM kanban_boards WHERE id = $1', [access.board.id]);
    if (access.board.scope_type !== 'team') {
      try {
        const remaining = await tx.get("SELECT COUNT(*) as count FROM kanban_boards WHERE owner_id = $1 AND COALESCE(scope_type, 'personal') = 'personal'", [userId(req)]);
        if (Number(remaining?.count || 0) === 0) {
          await tx.run(`INSERT INTO user_preferences (user_id, key, value)
            VALUES ($1, 'kanban_personal_deleted', '1')
            ON CONFLICT (user_id, key) DO UPDATE SET value = '1'`, [userId(req)]);
        }
      } catch {}
    }
  });
  req.broadcast({ type: 'kanban_updated', boardId: access.board.id });
  res.json({ success: true });
}));

router.post('/boards/:boardId/columns', asyncRoute(async (req, res) => {
  const access = await boardAccess(req.params.boardId, userId(req), true);
  if (!access) return res.status(403).json({ error: 'Sem permissão' });
  const title = String(req.body.title || '').trim();
  if (!isNonEmptyString(title, 60)) return res.status(400).json({ error: 'Nome da lista inválido (máximo de 60 caracteres)' });
  if (req.body.color !== undefined && !isHexColor(req.body.color)) return res.status(400).json({ error: 'Cor inválida' });
  const delayParam = req.body.autoArchiveDelay !== undefined ? req.body.autoArchiveDelay : req.body.auto_archive_delay;
  const autoArchiveDelay = delayParam && AUTO_ARCHIVE_DELAYS.has(delayParam) ? delayParam : 'never';
  const next = await db.get('SELECT COALESCE(MAX(position), -1) + 1 next FROM kanban_columns WHERE board_id = $1', [access.board.id]);
  const columnId = id('col');
  await db.run('INSERT INTO kanban_columns (id, board_id, title, color, position, auto_archive_delay, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [columnId, access.board.id, title, req.body.color || '#64748b', Number(next.next), autoArchiveDelay, new Date().toISOString()]);
  req.broadcast({ type: 'kanban_updated', boardId: access.board.id });
  res.status(201).json(columnDto(await db.get('SELECT * FROM kanban_columns WHERE id = $1', [columnId])));
}));

router.put('/columns/:columnId', asyncRoute(async (req, res) => {
  const column = await db.get('SELECT * FROM kanban_columns WHERE id = $1', [req.params.columnId]);
  const access = column && await boardAccess(column.board_id, userId(req), true);
  if (!column || !access) return res.status(404).json({ error: 'Lista não encontrada' });
  if (req.body.title !== undefined && !isNonEmptyString(req.body.title, 60)) return res.status(400).json({ error: 'Nome da lista inválido' });
  if (req.body.color !== undefined && !isHexColor(req.body.color)) return res.status(400).json({ error: 'Cor inválida' });
  if (req.body.position !== undefined && (!Number.isInteger(req.body.position) || req.body.position < 0)) return res.status(400).json({ error: 'Posição inválida' });
  if (req.body.title !== undefined) await db.run('UPDATE kanban_columns SET title = $1 WHERE id = $2', [String(req.body.title).trim(), column.id]);
  if (req.body.color !== undefined) await db.run('UPDATE kanban_columns SET color = $1 WHERE id = $2', [req.body.color, column.id]);
  if (req.body.position !== undefined) await db.run('UPDATE kanban_columns SET position = $1 WHERE id = $2', [Number(req.body.position), column.id]);
  const delayParam = req.body.autoArchiveDelay !== undefined ? req.body.autoArchiveDelay : req.body.auto_archive_delay;
  if (delayParam !== undefined && AUTO_ARCHIVE_DELAYS.has(delayParam)) {
    await db.run('UPDATE kanban_columns SET auto_archive_delay = $1 WHERE id = $2', [delayParam, column.id]);
    await autoArchiveColumnTasks(column.board_id, req.broadcast);
  }
  req.broadcast({ type: 'kanban_updated', boardId: column.board_id });
  res.json(columnDto(await db.get('SELECT * FROM kanban_columns WHERE id = $1', [column.id])));
}));

router.delete('/columns/:columnId', asyncRoute(async (req, res) => {
  const column = await db.get('SELECT * FROM kanban_columns WHERE id = $1', [req.params.columnId]);
  const access = column && await boardAccess(column.board_id, userId(req), true);
  if (!column || !access) return res.status(404).json({ error: 'Lista não encontrada' });
  const tasks = await db.all(`WITH RECURSIVE tree(id, archived) AS (
    SELECT id, archived FROM kanban_tasks WHERE column_id = $1
    UNION ALL
    SELECT t.id, t.archived FROM kanban_tasks t JOIN tree ON t.parent_task_id = tree.id
  ) SELECT DISTINCT id, archived FROM tree`, [column.id]);
  if (tasks.some(task => !task.archived)) return res.status(409).json({ error: 'Mova ou arquive os cartões e suas subtarefas antes de excluir a lista' });
  for (const task of tasks) await deleteTaskCalendarEvents(task.id, req.broadcast);
  await db.transaction(async tx => {
    for (const task of [...tasks].reverse()) {
      await tx.run(`DELETE FROM attachments WHERE owner_type = 'task' AND owner_id = $1`, [task.id]);
      await tx.run('DELETE FROM kanban_tasks WHERE id = $1', [task.id]);
    }
    await tx.run('DELETE FROM kanban_columns WHERE id = $1', [column.id]);
  });
  req.broadcast({ type: 'kanban_updated', boardId: column.board_id });
  res.json({ success: true });
}));

router.post('/boards/:boardId/tasks', asyncRoute(async (req, res) => {
  const access = await boardAccess(req.params.boardId, userId(req), true);
  if (!access) return res.status(403).json({ error: 'Sem permissão' });
  const column = await db.get('SELECT * FROM kanban_columns WHERE id = $1 AND board_id = $2', [req.body.columnId, access.board.id]);
  const title = String(req.body.title || '').trim();
  const parentTaskId = req.body.parentTaskId || null;
  const assigneeIds = [...new Set(Array.isArray(req.body.assigneeIds) ? req.body.assigneeIds.filter(Boolean) : (req.body.assigneeId ? [req.body.assigneeId] : []))];
  const validationError = validateTaskInput({ ...req.body, title, assigneeIds });
  if (validationError) return res.status(400).json({ error: validationError });
  if (!column) return res.status(400).json({ error: 'A lista informada não pertence a este quadro' });
  if (!(await validAssignees(access.board, assigneeIds))) return res.status(400).json({ error: 'Um ou mais responsáveis não pertencem a este Kanban' });
  if (parentTaskId && !(await db.get('SELECT 1 FROM kanban_tasks WHERE id = $1 AND board_id = $2 AND deleted_at IS NULL', [parentTaskId, access.board.id]))) return res.status(400).json({ error: 'Tarefa principal inválida' });
  const next = await db.get(`SELECT COALESCE(MAX(position), -1) + 1 next FROM kanban_tasks
    WHERE column_id = $1 AND archived = 0 AND COALESCE(parent_task_id, '') = COALESCE($2, '')`, [column.id, parentTaskId]);
  const taskId = id('tsk');
  const now = new Date().toISOString();
  await db.run(`INSERT INTO kanban_tasks
    (id, board_id, column_id, title, description, position, priority, due_date, labels, assignee_id, assignee_ids, checklist, archived, created_by, created_at, updated_at, parent_task_id, color, column_entered_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, $13, $14, $15, $16, $17, $18)`, [taskId, access.board.id, column.id, title,
    req.body.description || '', Number(next.next), req.body.priority || 'medium', req.body.dueDate || null,
    JSON.stringify(req.body.labels || []), assigneeIds[0] || null, JSON.stringify(assigneeIds), JSON.stringify(req.body.checklist || []), userId(req), now, now, parentTaskId, req.body.color || null, now]);
  await syncTaskCalendarEvents(taskId, req.broadcast);
  await autoArchiveColumnTasks(access.board.id, req.broadcast);
  req.broadcast({ type: 'kanban_updated', boardId: access.board.id, taskId });
  res.status(201).json(taskDto(await db.get('SELECT * FROM kanban_tasks WHERE id = $1', [taskId]), await listAttachments('task', taskId)));
}));

router.put('/tasks/:taskId', asyncRoute(async (req, res) => {
  const task = await db.get('SELECT * FROM kanban_tasks WHERE id = $1', [req.params.taskId]);
  const access = task && await boardAccess(task.board_id, userId(req), true);
  if (!task || !access || task.deleted_at) return res.status(404).json({ error: 'Tarefa não encontrada' });
  const validationError = validateTaskInput(req.body, true);
  if (validationError) return res.status(400).json({ error: validationError });
  if (req.body.columnId !== undefined && !(await db.get('SELECT 1 FROM kanban_columns WHERE id = $1 AND board_id = $2', [req.body.columnId, task.board_id]))) {
    return res.status(400).json({ error: 'A lista informada não pertence a este quadro' });
  }
  if (req.body.position !== undefined && (!Number.isInteger(req.body.position) || req.body.position < 0)) return res.status(400).json({ error: 'Posição inválida' });
  const nextAssigneeIds = req.body.assigneeIds !== undefined
    ? [...new Set(Array.isArray(req.body.assigneeIds) ? req.body.assigneeIds.filter(Boolean) : [])]
    : null;
  if (nextAssigneeIds && !(await validAssignees(access.board, nextAssigneeIds))) return res.status(400).json({ error: 'Um ou mais responsáveis não pertencem a este Kanban' });
  const now = new Date().toISOString();
  let columnChanged = false;
  if (req.body.columnId !== undefined && req.body.columnId !== task.column_id) {
    columnChanged = true;
    await db.run('UPDATE kanban_tasks SET column_entered_at = $1 WHERE id = $2', [now, task.id]);
  }
  const fields = { title: 'title', description: 'description', columnId: 'column_id', position: 'position', priority: 'priority', dueDate: 'due_date', archived: 'archived', color: 'color' };
  for (const [input, columnName] of Object.entries(fields)) {
    if (req.body[input] === undefined) continue;
    const value = input === 'archived' ? (req.body[input] ? 1 : 0) : req.body[input];
    await db.run(`UPDATE kanban_tasks SET ${columnName} = $1, updated_at = $2 WHERE id = $3`, [value ?? null, now, task.id]);
  }
  if (req.body.labels !== undefined) await db.run('UPDATE kanban_tasks SET labels = $1, updated_at = $2 WHERE id = $3', [JSON.stringify(req.body.labels), now, task.id]);
  if (req.body.checklist !== undefined) await db.run('UPDATE kanban_tasks SET checklist = $1, updated_at = $2 WHERE id = $3', [JSON.stringify(req.body.checklist), now, task.id]);
  if (nextAssigneeIds) await db.run('UPDATE kanban_tasks SET assignee_ids = $1, assignee_id = $2, updated_at = $3 WHERE id = $4', [JSON.stringify(nextAssigneeIds), nextAssigneeIds[0] || null, now, task.id]);
  await syncTaskCalendarEvents(task.id, req.broadcast);
  if (columnChanged) {
    await autoArchiveColumnTasks(task.board_id, req.broadcast);
  }
  req.broadcast({ type: 'kanban_updated', boardId: task.board_id, taskId: task.id });
  res.json(taskDto(await db.get('SELECT * FROM kanban_tasks WHERE id = $1', [task.id]), await listAttachments('task', task.id)));
}));

router.post('/boards/:boardId/reorder', asyncRoute(async (req, res) => {
  const access = await boardAccess(req.params.boardId, userId(req), true);
  if (!access) return res.status(403).json({ error: 'Sem permissão' });
  const columns = Array.isArray(req.body.columns) ? req.body.columns : [];
  const tasks = Array.isArray(req.body.tasks) ? req.body.tasks : [];
  if (columns.some(columnId => typeof columnId !== 'string') || new Set(columns).size !== columns.length) return res.status(400).json({ error: 'Ordenação de listas inválida' });
  const boardColumns = await db.all('SELECT id FROM kanban_columns WHERE board_id = $1', [access.board.id]);
  const allowedColumns = new Set(boardColumns.map(column => column.id));
  if (columns.some(columnId => !allowedColumns.has(columnId))) return res.status(400).json({ error: 'Uma lista não pertence a este quadro' });
  if (tasks.some(item => !item || typeof item.id !== 'string' || !allowedColumns.has(item.columnId) || !Number.isInteger(item.position) || item.position < 0) ||
      new Set(tasks.map(item => item.id)).size !== tasks.length) return res.status(400).json({ error: 'Ordenação de tarefas inválida' });
  if (tasks.length) {
    const taskRows = await db.all('SELECT id FROM kanban_tasks WHERE board_id = $1', [access.board.id]);
    const allowedTasks = new Set(taskRows.map(item => item.id));
    if (tasks.some(item => !allowedTasks.has(item.id))) return res.status(400).json({ error: 'Uma tarefa não pertence a este quadro' });
  }
  const existingTasks = await db.all('SELECT id, column_id FROM kanban_tasks WHERE board_id = $1', [access.board.id]);
  const colMap = new Map(existingTasks.map(t => [t.id, t.column_id]));
  const now = new Date().toISOString();
  await db.transaction(async tx => {
    for (const [position, columnId] of columns.entries()) {
      await tx.run('UPDATE kanban_columns SET position = $1 WHERE id = $2 AND board_id = $3', [position, columnId, access.board.id]);
    }
    for (const item of tasks) {
      const oldCol = colMap.get(item.id);
      if (oldCol && oldCol !== item.columnId) {
        await tx.run('UPDATE kanban_tasks SET column_id = $1, position = $2, updated_at = $3, column_entered_at = $3 WHERE id = $4 AND board_id = $5',
          [item.columnId, item.position, now, item.id, access.board.id]);
      } else {
        await tx.run('UPDATE kanban_tasks SET column_id = $1, position = $2, updated_at = $3 WHERE id = $4 AND board_id = $5',
          [item.columnId, item.position, now, item.id, access.board.id]);
      }
    }
  });
  await autoArchiveColumnTasks(access.board.id, req.broadcast);
  req.broadcast({ type: 'kanban_updated', boardId: access.board.id });
  res.json({ success: true });
}));

router.put('/tasks/:taskId/restore', asyncRoute(async (req, res) => {
  const task = await db.get('SELECT * FROM kanban_tasks WHERE id = $1', [req.params.taskId]);
  const access = task && await boardAccess(task.board_id, userId(req));
  if (!task || !access) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (access.role !== 'admin') return res.status(403).json({ error: 'Somente administradores podem restaurar tarefas' });
  if (!task.deleted_at) return res.status(409).json({ error: 'A tarefa não está na lixeira' });
  if (task.parent_task_id && await db.get('SELECT 1 FROM kanban_tasks WHERE id = $1 AND deleted_at IS NOT NULL', [task.parent_task_id])) {
    return res.status(409).json({ error: 'Restaure a tarefa principal para recuperar esta ramificação' });
  }
  const descendants = await taskDescendants(task.id);
  const restoredIds = [task.id, ...descendants.map(item => item.id)];
  const now = new Date().toISOString();
  await db.transaction(async tx => {
    for (const restoredId of restoredIds) await tx.run('UPDATE kanban_tasks SET deleted_at = NULL, deleted_by = NULL, updated_at = $1, column_entered_at = $1 WHERE id = $2', [now, restoredId]);
  });
  for (const restoredId of restoredIds) await syncTaskCalendarEvents(restoredId, req.broadcast);
  await autoArchiveColumnTasks(task.board_id, req.broadcast);
  req.broadcast({ type: 'kanban_updated', boardId: task.board_id, taskId: task.id });
  res.json({ success: true, restoredDescendants: descendants.length });
}));

router.delete('/tasks/:taskId/permanent', asyncRoute(async (req, res) => {
  const task = await db.get('SELECT * FROM kanban_tasks WHERE id = $1', [req.params.taskId]);
  const access = task && await boardAccess(task.board_id, userId(req));
  if (!task || !access) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (access.role !== 'admin') return res.status(403).json({ error: 'Somente administradores podem excluir tarefas permanentemente' });
  if (!task.deleted_at) return res.status(409).json({ error: 'Mova a tarefa para a lixeira antes da exclusão permanente' });
  const deletedDescendants = await permanentlyDeleteTaskTree(task, req.broadcast);
  req.broadcast({ type: 'kanban_updated', boardId: task.board_id, taskId: task.id });
  res.json({ success: true, deletedDescendants });
}));

router.delete('/tasks/:taskId', asyncRoute(async (req, res) => {
  const task = await db.get('SELECT * FROM kanban_tasks WHERE id = $1', [req.params.taskId]);
  const access = task && await boardAccess(task.board_id, userId(req));
  if (!task || !access) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (access.role !== 'admin') return res.status(403).json({ error: 'Somente administradores podem excluir tarefas' });
  if (task.deleted_at) return res.status(409).json({ error: 'A tarefa já está na lixeira' });
  const descendants = await taskDescendants(task.id);
  for (const child of descendants) await deleteTaskCalendarEvents(child.id, req.broadcast);
  await deleteTaskCalendarEvents(task.id, req.broadcast);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.transaction(async tx => {
    await tx.run('UPDATE kanban_tasks SET deleted_at = $1, deleted_by = $2, updated_at = $3 WHERE id = $4', [now, userId(req), now, task.id]);
    for (const child of descendants) await tx.run('UPDATE kanban_tasks SET deleted_at = $1, deleted_by = $2, updated_at = $3 WHERE id = $4', [now, userId(req), now, child.id]);
  });
  req.broadcast({ type: 'kanban_updated', boardId: task.board_id, taskId: task.id });
  res.json({ success: true, trashedDescendants: descendants.length, expiresAt });
}));

// Timeline e Comentários para Tarefas Kanban
router.get('/tasks/:taskId/timeline', asyncRoute(async (req, res) => {
  const task = await db.get('SELECT * FROM kanban_tasks WHERE id = $1', [req.params.taskId]);
  const access = task && await boardAccess(task.board_id, userId(req));
  if (!task || !access) return res.status(404).json({ error: 'Tarefa não encontrada' });

  const comments = await db.all(`SELECT id, entity_type AS "entityType", entity_id AS "entityId",
    user_id AS "userId", user_name AS "userName", user_avatar AS "userAvatar",
    content, mentions, created_at AS "createdAt"
    FROM activity_comments WHERE entity_type = 'task' AND entity_id = $1
    ORDER BY created_at ASC`, [task.id]);

  const logs = await db.all(`SELECT id, entity_type AS "entityType", entity_id AS "entityId",
    user_id AS "userId", user_name AS "userName", action, changes, created_at AS "createdAt"
    FROM activity_logs WHERE entity_type = 'task' AND entity_id = $1
    ORDER BY created_at ASC`, [task.id]);

  const formattedComments = comments.map(c => ({
    ...c,
    mentions: parseJson(c.mentions, [])
  }));

  const formattedLogs = logs.map(l => ({
    ...l,
    changes: parseJson(l.changes, {})
  }));

  res.json({ comments: formattedComments, logs: formattedLogs });
}));

router.post('/tasks/:taskId/comments', asyncRoute(async (req, res) => {
  const task = await db.get('SELECT * FROM kanban_tasks WHERE id = $1', [req.params.taskId]);
  const access = task && await boardAccess(task.board_id, userId(req), true);
  if (!task || !access) return res.status(404).json({ error: 'Tarefa não encontrada' });

  const { content, userName = 'Usuário', userAvatar = '' } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Conteúdo do comentário é obrigatório' });

  // Detectar @menções simples (@nome ou @userId)
  const mentionMatches = content.match(/@(\w+)/g) || [];
  const mentions = mentionMatches.map(m => m.slice(1));

  const commentId = id('comm');
  const now = new Date().toISOString();

  await db.run(`INSERT INTO activity_comments (id, entity_type, entity_id, user_id, user_name, user_avatar, content, mentions, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [commentId, 'task', task.id, userId(req), userName, userAvatar, content.trim(), JSON.stringify(mentions), now]);

  // Se houver menções ou responsáveis, gerar notificações in-app
  for (const m of mentions) {
    await db.run(`INSERT INTO inapp_notifications (id, user_id, title, message, type, reference_type, reference_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id('notif'), m, 'Você foi mencionado', `${userName} mencionou você na tarefa: ${task.title}`, 'mention', 'task', task.id, now]);
  }

  req.broadcast({ type: 'kanban_updated', boardId: task.board_id, taskId: task.id });
  res.status(201).json({
    id: commentId,
    entityType: 'task',
    entityId: task.id,
    userId: userId(req),
    userName,
    userAvatar,
    content: content.trim(),
    mentions,
    createdAt: now
  });
}));

// Exportação CSV do Quadro Kanban (UTF-8 com BOM para Excel)
router.get('/boards/:boardId/export-csv', asyncRoute(async (req, res) => {
  const access = await boardAccess(req.params.boardId, userId(req));
  if (!access) return res.status(404).json({ error: 'Quadro não encontrado' });

  const columns = await db.all('SELECT * FROM kanban_columns WHERE board_id = $1 ORDER BY position ASC', [req.params.boardId]);
  const tasks = await db.all('SELECT * FROM kanban_tasks WHERE board_id = $1 AND deleted_at IS NULL ORDER BY position ASC', [req.params.boardId]);

  const colMap = new Map(columns.map(c => [c.id, c.title]));

  const rows = [
    ['ID', 'Título', 'Coluna', 'Prioridade', 'Prazo', 'Etiquetas', 'Responsável', 'Subtarefa de', 'Criado em', 'Descrição']
  ];

  for (const t of tasks) {
    rows.push([
      t.id,
      t.title || '',
      colMap.get(t.column_id) || 'Sem Coluna',
      t.priority || 'medium',
      t.due_date || '',
      (parseJson(t.labels, [])).join('; '),
      t.assignee_id || '',
      t.parent_task_id || '',
      t.created_at || '',
      (t.description || '').replace(/\r?\n/g, ' ')
    ]);
  }

  const csvContent = rows.map(r => r.map(field => `"${String(field).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const bom = '\uFEFF';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="quadro-${access.board.name || 'kanban'}.csv"`);
  res.send(bom + csvContent);
}));

module.exports = router;
module.exports.purgeExpiredTrash = purgeExpiredTrash;
module.exports.autoArchiveColumnTasks = autoArchiveColumnTasks;
module.exports.boardAccess = boardAccess;
module.exports.validAssignees = validAssignees;
module.exports.columnDto = columnDto;
module.exports.taskDto = taskDto;
module.exports.syncTaskCalendarEvents = syncTaskCalendarEvents;
module.exports.deleteTaskCalendarEvents = deleteTaskCalendarEvents;
module.exports.taskDescendants = taskDescendants;
module.exports.createDefaultPersonalBoard = createDefaultPersonalBoard;
module.exports.ensureDefaultCalendar = ensureDefaultCalendar;
