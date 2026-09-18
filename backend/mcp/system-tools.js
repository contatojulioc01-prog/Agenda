const crypto = require('crypto');
const { z } = require('zod');
const db = require('../db');
const kanban = require('../routes/kanban');
const events = require('../routes/events');
const { listAttachments } = require('../routes/attachments');
const { isHexColor, isNonEmptyString, isOptionalString } = require('../validation');

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const TIME = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const id = prefix => `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
const noBroadcast = () => {};

function fail(message) {
  const error = new Error(message);
  error.expose = true;
  throw error;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function calendarDto(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isPrivate: row.is_private === 1,
    isDefault: row.is_default === 1,
    isTaskCalendar: row.is_task_calendar === 1,
    ownerId: row.owner_id,
    permission: row.my_permission,
    taskTeamName: row.task_team_name || null,
    createdAt: row.created_at,
  };
}

function teamDto(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    color: row.color,
    ownerId: row.owner_id,
    calendarId: row.calendar_id || null,
    role: row.my_role,
    memberCount: Number(row.member_count || 0),
    boardId: row.board_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function boardDto(row, role) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    color: row.color,
    ownerId: row.owner_id,
    scopeType: row.scope_type || 'personal',
    teamId: row.team_id || null,
    role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function taskDto(row) {
  const assigneeIds = parseJson(row.assignee_ids, []);
  if (!assigneeIds.length && row.assignee_id) assigneeIds.push(row.assignee_id);
  return {
    id: row.id,
    boardId: row.board_id,
    columnId: row.column_id,
    title: row.title,
    description: row.description || '',
    position: Number(row.position),
    priority: row.priority,
    dueDate: row.due_date || null,
    labels: parseJson(row.labels, []),
    assigneeIds,
    checklist: parseJson(row.checklist, []),
    archived: row.archived === 1,
    parentTaskId: row.parent_task_id || null,
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function calendarAccess(calendarId, userId, write = false, owner = false) {
  const row = await db.get(`SELECT c.*, COALESCE(cm.permission,
      CASE WHEN c.owner_id = $2 THEN 'owner' END) AS my_permission,
      kt.name AS task_team_name
    FROM calendars c
    LEFT JOIN calendar_members cm ON cm.calendar_id = c.id AND cm.user_id = $2
    LEFT JOIN kanban_teams kt ON kt.calendar_id = c.id
    WHERE c.id = $1 AND (c.owner_id = $2 OR cm.user_id = $2)`, [calendarId, userId]);
  if (!row) return null;
  if (owner && row.my_permission !== 'owner') return null;
  if (write && !['owner', 'editor'].includes(row.my_permission)) return null;
  return row;
}

async function teamAccess(teamId, userId, admin = false) {
  const row = await db.get(`SELECT t.*, tm.role AS my_role,
      (SELECT COUNT(*) FROM kanban_team_members x WHERE x.team_id = t.id) AS member_count,
      (SELECT id FROM kanban_boards b WHERE b.team_id = t.id LIMIT 1) AS board_id
    FROM kanban_teams t JOIN kanban_team_members tm ON tm.team_id = t.id
    WHERE t.id = $1 AND tm.user_id = $2`, [teamId, userId]);
  if (!row || (admin && row.my_role !== 'admin')) return null;
  return row;
}

async function listTeams(userId) {
  const rows = await db.all(`SELECT t.*, tm.role AS my_role,
      (SELECT COUNT(*) FROM kanban_team_members x WHERE x.team_id = t.id) AS member_count,
      (SELECT id FROM kanban_boards b WHERE b.team_id = t.id LIMIT 1) AS board_id
    FROM kanban_teams t JOIN kanban_team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = $1 ORDER BY t.created_at`, [userId]);
  return rows.map(teamDto);
}

async function deleteBoardData(boardId, broadcast) {
  const tasks = await db.all('SELECT id FROM kanban_tasks WHERE board_id = $1', [boardId]);
  for (const task of tasks) await kanban.deleteTaskCalendarEvents(task.id, broadcast);
  await db.transaction(async tx => {
    await tx.run(`DELETE FROM attachments WHERE owner_type = 'task' AND owner_id IN
      (SELECT id FROM kanban_tasks WHERE board_id = $1)`, [boardId]);
    await tx.run('DELETE FROM kanban_tasks WHERE board_id = $1', [boardId]);
    await tx.run('DELETE FROM kanban_columns WHERE board_id = $1', [boardId]);
    await tx.run('DELETE FROM kanban_boards WHERE id = $1', [boardId]);
  });
}

async function executeSystemTool(name, args = {}, context = {}) {
  const userId = String(context.userId || '');
  const broadcast = context.broadcast || noBroadcast;
  if (!userId) fail('Usuário autenticado ausente.');

  if (name === 'obter_contexto_completo') {
    await Promise.all([kanban.ensureDefaultCalendar(userId, noBroadcast), kanban.createDefaultPersonalBoard(userId)]);
    const [calendars, teams, boards, calendarInvitations, teamInvitations, preferences, devices, counts] = await Promise.all([
      db.all(`SELECT DISTINCT c.*, COALESCE(cm.permission, CASE WHEN c.owner_id = $1 THEN 'owner' END) AS my_permission,
        kt.name AS task_team_name FROM calendars c
        LEFT JOIN calendar_members cm ON cm.calendar_id = c.id AND cm.user_id = $1
        LEFT JOIN kanban_teams kt ON kt.calendar_id = c.id
        WHERE c.owner_id = $1 OR cm.user_id = $1 ORDER BY c.created_at`, [userId]),
      listTeams(userId),
      db.all(`SELECT DISTINCT b.*, CASE WHEN b.scope_type = 'team' THEN tm.role ELSE 'admin' END AS my_role,
        t.name AS team_name FROM kanban_boards b
        LEFT JOIN kanban_team_members tm ON tm.team_id = b.team_id AND tm.user_id = $1
        LEFT JOIN kanban_teams t ON t.id = b.team_id
        WHERE (COALESCE(b.scope_type, 'personal') = 'personal' AND b.owner_id = $1)
          OR (b.scope_type = 'team' AND tm.user_id = $1) ORDER BY b.created_at`, [userId]),
      db.all(`SELECT i.id, i.calendar_id AS "calendarId", c.name AS "calendarName", i.permission, i.created_at AS "createdAt"
        FROM calendar_invitations i JOIN calendars c ON c.id = i.calendar_id
        WHERE i.user_id = $1 AND i.status = 'pending' ORDER BY i.created_at`, [userId]),
      db.all(`SELECT i.id, i.team_id AS "teamId", t.name AS "teamName", t.color AS "teamColor", i.invited_by AS "invitedBy", i.created_at AS "createdAt"
        FROM kanban_team_invitations i JOIN kanban_teams t ON t.id = i.team_id
        WHERE i.user_id = $1 AND i.status = 'pending' ORDER BY i.created_at`, [userId]),
      db.get('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]),
      db.all('SELECT id, name, enabled, created_at, last_seen_at FROM notification_devices WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      db.get(`SELECT
        (SELECT COUNT(DISTINCT e.id) FROM events e JOIN calendars c ON c.id=e.calendar_id LEFT JOIN calendar_members cm ON cm.calendar_id=c.id AND cm.user_id=$1 WHERE c.owner_id=$1 OR cm.user_id=$1) AS events,
        (SELECT COUNT(DISTINCT kt.id) FROM kanban_tasks kt JOIN kanban_boards b ON b.id=kt.board_id LEFT JOIN kanban_team_members tm ON tm.team_id=b.team_id AND tm.user_id=$1 WHERE kt.deleted_at IS NULL AND ((COALESCE(b.scope_type,'personal')='personal' AND b.owner_id=$1) OR (b.scope_type='team' AND tm.user_id=$1))) AS tasks`, [userId]),
    ]);
    return {
      userId,
      permissionsModel: {
        calendar: ['owner', 'editor', 'viewer'],
        team: ['admin', 'member'],
        notes: ['viewer apenas consulta', 'editor altera agenda e eventos', 'owner também gerencia membros e privacidade', 'agenda Tarefas é automática e administrada pelo time'],
      },
      calendars: calendars.map(calendarDto),
      teams,
      boards: boards.map(row => ({ ...boardDto(row, row.my_role), teamName: row.team_name || null })),
      invitations: { calendars: calendarInvitations, teams: teamInvitations },
      notifications: {
        preferences: preferences ? {
          enabled: preferences.enabled === 1,
          taskEnabled: preferences.task_enabled === 1,
          eventEnabled: preferences.event_enabled === 1,
          taskTime: preferences.task_time,
          taskDaysBefore: Number(preferences.task_days_before),
          eventMinutesBefore: Number(preferences.event_minutes_before),
        } : { enabled: true, taskEnabled: true, eventEnabled: true, taskTime: '08:30', taskDaysBefore: 1, eventMinutesBefore: 15 },
        devices: devices.map(row => ({ id: row.id, name: row.name, enabled: row.enabled === 1, createdAt: row.created_at, lastSeenAt: row.last_seen_at || null })),
      },
      totals: { events: Number(counts.events), tasks: Number(counts.tasks) },
    };
  }

  if (name === 'obter_agenda') {
    const calendar = await calendarAccess(args.agendaId, userId);
    if (!calendar) fail('Agenda não encontrada ou sem acesso.');
    const [members, eventCount] = await Promise.all([
      db.all('SELECT id, user_id AS "userId", permission FROM calendar_members WHERE calendar_id = $1 ORDER BY permission, user_id', [calendar.id]),
      db.get('SELECT COUNT(*) AS count FROM events WHERE calendar_id = $1', [calendar.id]),
    ]);
    return { ...calendarDto(calendar), members, eventCount: Number(eventCount.count) };
  }

  if (name === 'criar_agenda') {
    if (!isNonEmptyString(args.nome, 80) || !isHexColor(args.cor)) fail('Nome ou cor da agenda inválidos.');
    const calendarId = id('cal');
    const now = new Date().toISOString();
    const invitations = [...new Map((args.membros || []).filter(item => item.userId !== userId).map(item => [item.userId, item])).values()];
    await db.transaction(async tx => {
      await tx.run('INSERT INTO calendars (id, name, color, is_private, owner_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [calendarId, args.nome.trim(), args.cor, args.privada === false ? 0 : 1, userId, now]);
      await tx.run('INSERT INTO calendar_members (id, calendar_id, user_id, permission) VALUES ($1,$2,$3,$4)', [id('mbr'), calendarId, userId, 'owner']);
      for (const member of invitations) await tx.run(`INSERT INTO calendar_invitations
        (id, calendar_id, user_id, permission, status, created_at) VALUES ($1,$2,$3,$4,'pending',$5)`,
      [id('cinv'), calendarId, member.userId, member.permissao, now]);
    });
    broadcast({ type: 'calendar_created', calendarId });
    for (const member of invitations) broadcast({ type: 'calendar_invited', calendarId, userId: member.userId });
    return calendarDto({ ...(await db.get('SELECT * FROM calendars WHERE id = $1', [calendarId])), my_permission: 'owner' });
  }

  if (name === 'atualizar_agenda') {
    const calendar = await calendarAccess(args.agendaId, userId, true);
    if (!calendar) fail('Agenda não encontrada ou sem permissão.');
    if (calendar.is_task_calendar === 1) fail('A agenda Tarefas é gerenciada automaticamente pelo time.');
    if (args.privada !== undefined && calendar.my_permission !== 'owner') fail('Somente o dono pode alterar a privacidade.');
    if (calendar.is_default === 1 && args.privada === false) fail('A agenda padrão deve permanecer privada.');
    if (args.nome !== undefined && !isNonEmptyString(args.nome, 80)) fail('Nome inválido.');
    if (args.cor !== undefined && !isHexColor(args.cor)) fail('Cor inválida.');
    if (args.nome !== undefined) await db.run('UPDATE calendars SET name=$1 WHERE id=$2', [args.nome.trim(), calendar.id]);
    if (args.cor !== undefined) await db.run('UPDATE calendars SET color=$1 WHERE id=$2', [args.cor, calendar.id]);
    if (args.privada !== undefined) await db.run('UPDATE calendars SET is_private=$1 WHERE id=$2', [args.privada ? 1 : 0, calendar.id]);
    broadcast({ type: 'calendar_updated', calendarId: calendar.id });
    return calendarDto({ ...(await db.get('SELECT * FROM calendars WHERE id=$1', [calendar.id])), my_permission: calendar.my_permission });
  }

  if (name === 'excluir_agenda') {
    if (args.confirmar !== true) fail('A exclusão exige confirmar=true.');
    const calendar = await calendarAccess(args.agendaId, userId, false, true);
    if (!calendar) fail('Agenda não encontrada ou sem permissão de proprietário.');
    if (calendar.is_default === 1) fail('A agenda padrão não pode ser excluída.');
    if (calendar.is_task_calendar === 1) fail('A agenda Tarefas só pode ser excluída junto com o time.');
    await db.transaction(async tx => {
      await tx.run(`DELETE FROM attachments WHERE owner_type='event' AND owner_id IN (SELECT id FROM events WHERE calendar_id=$1)`, [calendar.id]);
      await tx.run('DELETE FROM calendar_invitations WHERE calendar_id=$1', [calendar.id]);
      await tx.run('DELETE FROM calendar_members WHERE calendar_id=$1', [calendar.id]);
      await tx.run('DELETE FROM events WHERE calendar_id=$1', [calendar.id]);
      await tx.run('DELETE FROM calendars WHERE id=$1', [calendar.id]);
    });
    broadcast({ type: 'calendar_deleted', calendarId: calendar.id });
    return { success: true, agendaId: calendar.id };
  }

  if (name === 'listar_membros_agenda') {
    if (!(await calendarAccess(args.agendaId, userId))) fail('Agenda não encontrada ou sem acesso.');
    return db.all('SELECT id, user_id AS "userId", permission AS permissao FROM calendar_members WHERE calendar_id=$1 ORDER BY permission,user_id', [args.agendaId]);
  }

  if (name === 'listar_convites_agenda') {
    if (args.agendaId) {
      if (!(await calendarAccess(args.agendaId, userId, false, true))) fail('Agenda não encontrada ou sem permissão de proprietário.');
      return db.all(`SELECT id, calendar_id AS "agendaId", user_id AS "userId", permission AS permissao, status, created_at AS "createdAt"
        FROM calendar_invitations WHERE calendar_id=$1 ORDER BY created_at`, [args.agendaId]);
    }
    return db.all(`SELECT i.id, i.calendar_id AS "agendaId", c.name AS "agendaNome", i.permission AS permissao, i.created_at AS "createdAt"
      FROM calendar_invitations i JOIN calendars c ON c.id=i.calendar_id
      WHERE i.user_id=$1 AND i.status='pending' ORDER BY i.created_at`, [userId]);
  }

  if (name === 'convidar_membro_agenda') {
    const calendar = await calendarAccess(args.agendaId, userId, false, true);
    if (!calendar) fail('Agenda não encontrada ou sem permissão de proprietário.');
    if (calendar.is_task_calendar === 1) fail('Membros da agenda Tarefas são gerenciados pelo time.');
    if (args.usuarioId === userId) fail('O proprietário já pertence à agenda.');
    if (await db.get('SELECT 1 FROM calendar_members WHERE calendar_id=$1 AND user_id=$2', [calendar.id, args.usuarioId])) fail('Usuário já é membro da agenda.');
    const invitationId = id('cinv');
    const now = new Date().toISOString();
    await db.run(`INSERT INTO calendar_invitations (id,calendar_id,user_id,permission,status,created_at)
      VALUES ($1,$2,$3,$4,'pending',$5) ON CONFLICT(calendar_id,user_id) DO UPDATE SET permission=excluded.permission,status='pending',created_at=excluded.created_at`,
    [invitationId, calendar.id, args.usuarioId, args.permissao, now]);
    broadcast({ type: 'calendar_invited', calendarId: calendar.id, userId: args.usuarioId });
    return { success: true, agendaId: calendar.id, usuarioId: args.usuarioId, permissao: args.permissao };
  }

  if (name === 'responder_convite_agenda') {
    const invitation = await db.get(`SELECT * FROM calendar_invitations WHERE id=$1 AND user_id=$2 AND status='pending'`, [args.conviteId, userId]);
    if (!invitation) fail('Convite não encontrado.');
    await db.transaction(async tx => {
      if (args.aceitar) await tx.run(`INSERT INTO calendar_members (id,calendar_id,user_id,permission) VALUES ($1,$2,$3,$4)
        ON CONFLICT(calendar_id,user_id) DO UPDATE SET permission=excluded.permission`, [id('mbr'), invitation.calendar_id, userId, invitation.permission]);
      await tx.run('UPDATE calendar_invitations SET status=$1 WHERE id=$2', [args.aceitar ? 'accepted' : 'declined', invitation.id]);
    });
    broadcast({ type: args.aceitar ? 'invitation_accepted' : 'invitation_declined', calendarId: invitation.calendar_id, userId });
    return { success: true, accepted: args.aceitar };
  }

  if (name === 'alterar_membro_agenda' || name === 'remover_membro_agenda') {
    const calendar = await calendarAccess(args.agendaId, userId, false, true);
    if (!calendar) fail('Agenda não encontrada ou sem permissão de proprietário.');
    if (calendar.is_task_calendar === 1) fail('Membros da agenda Tarefas são gerenciados pelo time.');
    const member = await db.get('SELECT * FROM calendar_members WHERE id=$1 AND calendar_id=$2', [args.membroId, calendar.id]);
    if (!member) fail('Membro não encontrado.');
    if (member.permission === 'owner') fail('O proprietário não pode ser alterado ou removido.');
    if (name === 'alterar_membro_agenda') await db.run('UPDATE calendar_members SET permission=$1 WHERE id=$2', [args.permissao, member.id]);
    else await db.run('DELETE FROM calendar_members WHERE id=$1', [member.id]);
    broadcast({ type: name === 'alterar_membro_agenda' ? 'member_updated' : 'member_removed', calendarId: calendar.id, userId: member.user_id });
    return { success: true };
  }

  if (name === 'listar_equipes') return listTeams(userId);

  if (name === 'obter_equipe') {
    const team = await teamAccess(args.equipeId, userId);
    if (!team) fail('Equipe não encontrada ou sem acesso.');
    const members = await db.all('SELECT id,user_id AS "userId",role AS papel,joined_at AS "joinedAt" FROM kanban_team_members WHERE team_id=$1 ORDER BY role,joined_at', [team.id]);
    return { ...teamDto(team), members };
  }

  if (name === 'criar_equipe') {
    if (!isNonEmptyString(args.nome, 80) || !isOptionalString(args.descricao, 1000) || !isHexColor(args.cor)) fail('Dados da equipe inválidos.');
    const teamId = id('team');
    const now = new Date().toISOString();
    const boardId = id('brd');
    const calendarId = id('cal');
    await db.transaction(async tx => {
      await tx.run('INSERT INTO kanban_teams (id,name,description,color,owner_id,calendar_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [teamId,args.nome.trim(),args.descricao || '',args.cor,userId,calendarId,now,now]);
      await tx.run('INSERT INTO kanban_team_members (id,team_id,user_id,role,joined_at) VALUES ($1,$2,$3,$4,$5)', [id('tm'),teamId,userId,'admin',now]);
      await tx.run('INSERT INTO calendars (id,name,color,is_private,owner_id,is_task_calendar,created_at) VALUES ($1,$2,$3,0,$4,1,$5)', [calendarId,'Tarefas',args.cor,userId,now]);
      await tx.run('INSERT INTO calendar_members (id,calendar_id,user_id,permission) VALUES ($1,$2,$3,$4)', [id('mbr'),calendarId,userId,'owner']);
      await tx.run('INSERT INTO kanban_boards (id,name,description,color,owner_id,scope_type,team_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [boardId,`Kanban · ${args.nome.trim()}`,`Quadro compartilhado do time ${args.nome.trim()}`,args.cor,userId,'team',teamId,now,now]);
      for (const [position,title] of ['A fazer','Em andamento','Concluído'].entries()) await tx.run('INSERT INTO kanban_columns (id,board_id,title,color,position,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [id('col'),boardId,title,['#64748b','#f59e0b','#10b981'][position],position,now]);
    });
    broadcast({ type: 'kanban_team_updated', teamId, userId });
    broadcast({ type: 'calendar_created', calendarId, userId });
    return teamDto({ ...(await db.get('SELECT * FROM kanban_teams WHERE id=$1', [teamId])), my_role:'admin', member_count:1, board_id:boardId });
  }

  if (name === 'atualizar_equipe') {
    const team = await teamAccess(args.equipeId, userId, true);
    if (!team) fail('Equipe não encontrada ou sem permissão de administrador.');
    if (args.nome !== undefined && !isNonEmptyString(args.nome,80)) fail('Nome inválido.');
    if (!isOptionalString(args.descricao,1000)) fail('Descrição inválida.');
    if (args.cor !== undefined && !isHexColor(args.cor)) fail('Cor inválida.');
    const now = new Date().toISOString();
    if (args.nome !== undefined) await db.run('UPDATE kanban_teams SET name=$1,updated_at=$2 WHERE id=$3',[args.nome.trim(),now,team.id]);
    if (args.descricao !== undefined) await db.run('UPDATE kanban_teams SET description=$1,updated_at=$2 WHERE id=$3',[args.descricao,now,team.id]);
    if (args.cor !== undefined) await db.run('UPDATE kanban_teams SET color=$1,updated_at=$2 WHERE id=$3',[args.cor,now,team.id]);
    if (team.calendar_id && args.cor !== undefined) await db.run('UPDATE calendars SET color=$1 WHERE id=$2',[args.cor,team.calendar_id]);
    broadcast({ type:'kanban_team_updated', teamId:team.id });
    if (team.calendar_id) broadcast({ type:'calendar_updated', calendarId:team.calendar_id });
    return teamDto({ ...(await teamAccess(team.id,userId)), my_role:'admin' });
  }

  if (name === 'excluir_equipe') {
    if (args.confirmar !== true) fail('A exclusão exige confirmar=true.');
    const team = await teamAccess(args.equipeId,userId,true);
    if (!team) fail('Equipe não encontrada ou sem permissão de administrador.');
    const boards = await db.all('SELECT id FROM kanban_boards WHERE team_id=$1',[team.id]);
    for (const board of boards) await deleteBoardData(board.id,broadcast);
    await db.transaction(async tx => {
      await tx.run('DELETE FROM kanban_team_invitations WHERE team_id=$1',[team.id]);
      await tx.run('DELETE FROM kanban_team_members WHERE team_id=$1',[team.id]);
      if (team.calendar_id) {
        await tx.run(`DELETE FROM attachments WHERE owner_type='event' AND owner_id IN (SELECT id FROM events WHERE calendar_id=$1)`,[team.calendar_id]);
        await tx.run('DELETE FROM calendar_members WHERE calendar_id=$1',[team.calendar_id]);
        await tx.run('DELETE FROM events WHERE calendar_id=$1',[team.calendar_id]);
        await tx.run('DELETE FROM calendars WHERE id=$1',[team.calendar_id]);
      }
      await tx.run('DELETE FROM kanban_teams WHERE id=$1',[team.id]);
    });
    broadcast({ type:'kanban_team_updated', teamId:team.id });
    if (team.calendar_id) broadcast({ type:'calendar_deleted', calendarId:team.calendar_id });
    return { success:true,equipeId:team.id };
  }

  if (name === 'listar_membros_equipe') {
    if (!(await teamAccess(args.equipeId,userId))) fail('Equipe não encontrada ou sem acesso.');
    return db.all('SELECT id,user_id AS "userId",role AS papel,joined_at AS "joinedAt" FROM kanban_team_members WHERE team_id=$1 ORDER BY role,joined_at',[args.equipeId]);
  }

  if (name === 'listar_convites_equipe') {
    if (args.equipeId) {
      if (!(await teamAccess(args.equipeId,userId,true))) fail('Equipe não encontrada ou sem permissão de administrador.');
      return db.all('SELECT id,team_id AS "equipeId",user_id AS "userId",invited_by AS "convidadoPor",status,created_at AS "createdAt" FROM kanban_team_invitations WHERE team_id=$1 ORDER BY created_at',[args.equipeId]);
    }
    return db.all(`SELECT i.id,i.team_id AS "equipeId",t.name AS "equipeNome",t.color AS "equipeCor",i.invited_by AS "convidadoPor",i.created_at AS "createdAt"
      FROM kanban_team_invitations i JOIN kanban_teams t ON t.id=i.team_id WHERE i.user_id=$1 AND i.status='pending' ORDER BY i.created_at`,[userId]);
  }

  if (name === 'convidar_membro_equipe') {
    const team = await teamAccess(args.equipeId,userId,true);
    if (!team) fail('Equipe não encontrada ou sem permissão de administrador.');
    if (args.usuarioId===userId) fail('Selecione outro usuário.');
    if (await db.get('SELECT 1 FROM kanban_team_members WHERE team_id=$1 AND user_id=$2',[team.id,args.usuarioId])) fail('Usuário já pertence à equipe.');
    await db.run(`INSERT INTO kanban_team_invitations (id,team_id,user_id,invited_by,status,created_at) VALUES ($1,$2,$3,$4,'pending',$5)
      ON CONFLICT(team_id,user_id) DO UPDATE SET invited_by=excluded.invited_by,status='pending',created_at=excluded.created_at`,[id('tinv'),team.id,args.usuarioId,userId,new Date().toISOString()]);
    broadcast({ type:'kanban_team_invited',teamId:team.id,userId:args.usuarioId });
    return { success:true };
  }

  if (name === 'responder_convite_equipe') {
    const invitation = await db.get(`SELECT * FROM kanban_team_invitations WHERE id=$1 AND user_id=$2 AND status='pending'`,[args.conviteId,userId]);
    if (!invitation) fail('Convite não encontrado.');
    const team = await db.get('SELECT * FROM kanban_teams WHERE id=$1',[invitation.team_id]);
    if (!team) fail('Equipe não encontrada.');
    await db.transaction(async tx => {
      if (args.aceitar) {
        await tx.run(`INSERT INTO kanban_team_members (id,team_id,user_id,role,joined_at) VALUES ($1,$2,$3,'member',$4) ON CONFLICT(team_id,user_id) DO NOTHING`,[id('tm'),team.id,userId,new Date().toISOString()]);
        if (team.calendar_id) await tx.run(`INSERT INTO calendar_members (id,calendar_id,user_id,permission) VALUES ($1,$2,$3,'editor') ON CONFLICT(calendar_id,user_id) DO UPDATE SET permission='editor'`,[id('mbr'),team.calendar_id,userId]);
      }
      await tx.run('UPDATE kanban_team_invitations SET status=$1 WHERE id=$2',[args.aceitar?'accepted':'declined',invitation.id]);
    });
    broadcast({ type:args.aceitar?'kanban_team_joined':'kanban_team_declined',teamId:team.id,userId });
    return { success:true,accepted:args.aceitar };
  }

  if (name === 'remover_membro_equipe') {
    const team = await teamAccess(args.equipeId,userId,true);
    if (!team) fail('Equipe não encontrada ou sem permissão de administrador.');
    const member = await db.get('SELECT * FROM kanban_team_members WHERE id=$1 AND team_id=$2',[args.membroId,team.id]);
    if (!member || member.role==='admin') fail('Membro não encontrado ou administrador não removível.');
    await db.transaction(async tx => {
      await tx.run('DELETE FROM kanban_team_members WHERE id=$1',[member.id]);
      if (team.calendar_id) await tx.run('DELETE FROM calendar_members WHERE calendar_id=$1 AND user_id=$2',[team.calendar_id,member.user_id]);
    });
    const tasks = await db.all('SELECT kt.* FROM kanban_tasks kt JOIN kanban_boards kb ON kb.id=kt.board_id WHERE kb.team_id=$1',[team.id]);
    for (const task of tasks) {
      const assignees = parseJson(task.assignee_ids,[]).filter(item=>item!==member.user_id);
      await db.run('UPDATE kanban_tasks SET assignee_ids=$1,assignee_id=$2,updated_at=$3 WHERE id=$4',[JSON.stringify(assignees),assignees[0]||null,new Date().toISOString(),task.id]);
      await kanban.syncTaskCalendarEvents(task.id,broadcast);
    }
    broadcast({ type:'kanban_team_updated',teamId:team.id,userId:member.user_id });
    return { success:true };
  }

  if (name === 'obter_quadro') {
    const access = await kanban.boardAccess(args.quadroId,userId);
    if (!access) fail('Quadro não encontrado ou sem acesso.');
    const [columns,taskRows,trash] = await Promise.all([
      db.all('SELECT id,board_id AS "boardId",title,color,position FROM kanban_columns WHERE board_id=$1 ORDER BY position,created_at',[args.quadroId]),
      db.all('SELECT * FROM kanban_tasks WHERE board_id=$1 AND deleted_at IS NULL ORDER BY parent_task_id,column_id,position,created_at',[args.quadroId]),
      db.get('SELECT COUNT(*) AS count FROM kanban_tasks WHERE board_id=$1 AND deleted_at IS NOT NULL',[args.quadroId]),
    ]);
    const tasks = [];
    for (const row of taskRows) tasks.push({ ...taskDto(row), attachments: await listAttachments('task',row.id) });
    return { ...boardDto(access.board,access.role),columns,tasks,trashCount:Number(trash.count) };
  }

  if (name === 'criar_quadro') {
    if (!isNonEmptyString(args.nome,80)||!isOptionalString(args.descricao,1000)||!isHexColor(args.cor)) fail('Dados do quadro inválidos.');
    const boardId=id('brd'); const now=new Date().toISOString();
    await db.transaction(async tx=>{
      await tx.run('INSERT INTO kanban_boards (id,name,description,color,owner_id,scope_type,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,\'personal\',$6,$7)',[boardId,args.nome.trim(),args.descricao||'',args.cor,userId,now,now]);
      for(const [position,title] of ['A fazer','Em andamento','Concluído'].entries()) await tx.run('INSERT INTO kanban_columns (id,board_id,title,color,position,created_at) VALUES ($1,$2,$3,$4,$5,$6)',[id('col'),boardId,title,['#64748b','#f59e0b','#10b981'][position],position,now]);
    });
    broadcast({type:'kanban_updated',boardId});
    return boardDto(await db.get('SELECT * FROM kanban_boards WHERE id=$1',[boardId]),'admin');
  }

  if (name === 'atualizar_quadro') {
    const access=await kanban.boardAccess(args.quadroId,userId,true);
    if(!access) fail('Quadro não encontrado ou sem permissão.');
    if(args.nome!==undefined&&!isNonEmptyString(args.nome,80)) fail('Nome inválido.');
    if(!isOptionalString(args.descricao,1000)) fail('Descrição inválida.');
    if(args.cor!==undefined&&!isHexColor(args.cor)) fail('Cor inválida.');
    const now=new Date().toISOString();
    if(args.nome!==undefined) await db.run('UPDATE kanban_boards SET name=$1,updated_at=$2 WHERE id=$3',[args.nome.trim(),now,access.board.id]);
    if(args.descricao!==undefined) await db.run('UPDATE kanban_boards SET description=$1,updated_at=$2 WHERE id=$3',[args.descricao,now,access.board.id]);
    if(args.cor!==undefined) await db.run('UPDATE kanban_boards SET color=$1,updated_at=$2 WHERE id=$3',[args.cor,now,access.board.id]);
    broadcast({type:'kanban_updated',boardId:access.board.id});
    return boardDto(await db.get('SELECT * FROM kanban_boards WHERE id=$1',[access.board.id]),access.role);
  }

  if(name==='excluir_quadro'){
    if(args.confirmar!==true) fail('A exclusão exige confirmar=true.');
    const access=await kanban.boardAccess(args.quadroId,userId);
    if(!access||access.board.scope_type==='team'||access.board.owner_id!==userId) fail('Somente o proprietário pode excluir um quadro pessoal.');
    await deleteBoardData(access.board.id,broadcast); broadcast({type:'kanban_updated',boardId:access.board.id});
    return {success:true,quadroId:access.board.id};
  }

  if(name==='criar_coluna'){
    const access=await kanban.boardAccess(args.quadroId,userId,true); if(!access) fail('Quadro não encontrado ou sem permissão.');
    if(!isNonEmptyString(args.titulo,60)||!isHexColor(args.cor)) fail('Título ou cor inválidos.');
    const next=await db.get('SELECT COALESCE(MAX(position),-1)+1 AS next FROM kanban_columns WHERE board_id=$1',[args.quadroId]);
    const columnId=id('col'); await db.run('INSERT INTO kanban_columns (id,board_id,title,color,position,created_at) VALUES ($1,$2,$3,$4,$5,$6)',[columnId,args.quadroId,args.titulo.trim(),args.cor,Number(next.next),new Date().toISOString()]);
    broadcast({type:'kanban_updated',boardId:args.quadroId});
    return db.get('SELECT id,board_id AS "boardId",title,color,position FROM kanban_columns WHERE id=$1',[columnId]);
  }

  if(name==='atualizar_coluna'){
    const column=await db.get('SELECT * FROM kanban_columns WHERE id=$1',[args.colunaId]);
    const access=column&&await kanban.boardAccess(column.board_id,userId,true); if(!column||!access) fail('Coluna não encontrada ou sem permissão.');
    if(args.titulo!==undefined&&!isNonEmptyString(args.titulo,60)) fail('Título inválido.');
    if(args.cor!==undefined&&!isHexColor(args.cor)) fail('Cor inválida.');
    if(args.titulo!==undefined) await db.run('UPDATE kanban_columns SET title=$1 WHERE id=$2',[args.titulo.trim(),column.id]);
    if(args.cor!==undefined) await db.run('UPDATE kanban_columns SET color=$1 WHERE id=$2',[args.cor,column.id]);
    if(args.posicao!==undefined) await db.run('UPDATE kanban_columns SET position=$1 WHERE id=$2',[args.posicao,column.id]);
    broadcast({type:'kanban_updated',boardId:column.board_id});
    return db.get('SELECT id,board_id AS "boardId",title,color,position FROM kanban_columns WHERE id=$1',[column.id]);
  }

  if(name==='excluir_coluna'){
    if(args.confirmar!==true) fail('A exclusão exige confirmar=true.');
    const column=await db.get('SELECT * FROM kanban_columns WHERE id=$1',[args.colunaId]);
    const access=column&&await kanban.boardAccess(column.board_id,userId,true); if(!column||!access) fail('Coluna não encontrada ou sem permissão.');
    const tasks=await db.all(`WITH RECURSIVE tree(id,archived) AS (SELECT id,archived FROM kanban_tasks WHERE column_id=$1 UNION ALL SELECT t.id,t.archived FROM kanban_tasks t JOIN tree ON t.parent_task_id=tree.id) SELECT DISTINCT id,archived FROM tree`,[column.id]);
    if(tasks.some(task=>task.archived!==1)) fail('Mova ou arquive os cartões e subtarefas antes de excluir a coluna.');
    for(const task of tasks) await kanban.deleteTaskCalendarEvents(task.id,broadcast);
    await db.transaction(async tx=>{ for(const task of [...tasks].reverse()){ await tx.run(`DELETE FROM attachments WHERE owner_type='task' AND owner_id=$1`,[task.id]); await tx.run('DELETE FROM kanban_tasks WHERE id=$1',[task.id]); } await tx.run('DELETE FROM kanban_columns WHERE id=$1',[column.id]); });
    broadcast({type:'kanban_updated',boardId:column.board_id}); return {success:true};
  }

  if(name==='listar_lixeira_tarefas'){
    const access=await kanban.boardAccess(args.quadroId,userId); if(!access) fail('Quadro não encontrado ou sem acesso.');
    await kanban.purgeExpiredTrash(broadcast);
    const rows=await db.all(`SELECT * FROM kanban_tasks t WHERE board_id=$1 AND deleted_at IS NOT NULL AND (parent_task_id IS NULL OR NOT EXISTS (SELECT 1 FROM kanban_tasks p WHERE p.id=t.parent_task_id AND p.deleted_at IS NOT NULL)) ORDER BY deleted_at DESC`,[args.quadroId]);
    return rows.map(taskDto);
  }

  if(name==='restaurar_tarefa'){
    const task=await db.get('SELECT * FROM kanban_tasks WHERE id=$1',[args.tarefaId]); const access=task&&await kanban.boardAccess(task.board_id,userId);
    if(!task||!access||access.role!=='admin') fail('Tarefa não encontrada ou sem permissão de administrador.'); if(!task.deleted_at) fail('A tarefa não está na lixeira.');
    if(task.parent_task_id&&await db.get('SELECT 1 FROM kanban_tasks WHERE id=$1 AND deleted_at IS NOT NULL',[task.parent_task_id])) fail('Restaure primeiro a tarefa principal.');
    const descendants=await kanban.taskDescendants(task.id); const ids=[task.id,...descendants.map(item=>item.id)]; const now=new Date().toISOString();
    await db.transaction(async tx=>{for(const taskId of ids) await tx.run('UPDATE kanban_tasks SET deleted_at=NULL,deleted_by=NULL,updated_at=$1 WHERE id=$2',[now,taskId]);});
    for(const taskId of ids) await kanban.syncTaskCalendarEvents(taskId,broadcast); broadcast({type:'kanban_updated',boardId:task.board_id,taskId:task.id});
    return {success:true,subtarefasRestauradas:descendants.length};
  }

  if(name==='excluir_tarefa_permanentemente'){
    if(args.confirmar!==true) fail('A exclusão permanente exige confirmar=true.');
    const task=await db.get('SELECT * FROM kanban_tasks WHERE id=$1',[args.tarefaId]); const access=task&&await kanban.boardAccess(task.board_id,userId);
    if(!task||!access||access.role!=='admin') fail('Tarefa não encontrada ou sem permissão de administrador.'); if(!task.deleted_at) fail('Mova a tarefa para a lixeira antes da exclusão permanente.');
    const descendants=await kanban.taskDescendants(task.id); const all=[task,...descendants]; for(const item of all) await kanban.deleteTaskCalendarEvents(item.id,broadcast);
    await db.transaction(async tx=>{for(const item of [...all].reverse()){await tx.run(`DELETE FROM attachments WHERE owner_type='task' AND owner_id=$1`,[item.id]);await tx.run('DELETE FROM kanban_tasks WHERE id=$1',[item.id]);}});
    broadcast({type:'kanban_updated',boardId:task.board_id,taskId:task.id}); return {success:true,subtarefasExcluidas:descendants.length};
  }

  if(name==='listar_anexos'){
    if(args.tipo==='event') { const event=await db.get('SELECT * FROM events WHERE id=$1',[args.itemId]); if(!event||!(await events.hasAccess(event.calendar_id,userId))) fail('Evento não encontrado ou sem acesso.'); }
    else { const task=await db.get('SELECT * FROM kanban_tasks WHERE id=$1',[args.itemId]); if(!task||!(await kanban.boardAccess(task.board_id,userId))) fail('Tarefa não encontrada ou sem acesso.'); }
    return listAttachments(args.tipo,args.itemId);
  }

  if(name==='excluir_anexo'){
    if(args.confirmar!==true) fail('A exclusão exige confirmar=true.');
    const attachment=await db.get('SELECT * FROM attachments WHERE id=$1',[args.anexoId]); if(!attachment) fail('Anexo não encontrado.');
    if(attachment.owner_type==='event'){const event=await db.get('SELECT * FROM events WHERE id=$1',[attachment.owner_id]);if(!event||!(await events.hasAccess(event.calendar_id,userId,true))) fail('Sem permissão para excluir o anexo.');}
    else {const task=await db.get('SELECT * FROM kanban_tasks WHERE id=$1',[attachment.owner_id]);if(!task||!(await kanban.boardAccess(task.board_id,userId,true))) fail('Sem permissão para excluir o anexo.');}
    await db.run('DELETE FROM attachments WHERE id=$1',[attachment.id]); return {success:true,anexoId:attachment.id};
  }

  if(name==='obter_configuracao_notificacoes'){
    const row=await db.get('SELECT * FROM notification_preferences WHERE user_id=$1',[userId]); const devices=await db.all('SELECT id,name,enabled,created_at,last_seen_at FROM notification_devices WHERE user_id=$1 ORDER BY created_at DESC',[userId]);
    return {preferences:row?{enabled:row.enabled===1,taskEnabled:row.task_enabled===1,eventEnabled:row.event_enabled===1,taskTime:row.task_time,taskDaysBefore:Number(row.task_days_before),eventMinutesBefore:Number(row.event_minutes_before)}:{enabled:true,taskEnabled:true,eventEnabled:true,taskTime:'08:30',taskDaysBefore:1,eventMinutesBefore:15},devices:devices.map(item=>({id:item.id,name:item.name,enabled:item.enabled===1,createdAt:item.created_at,lastSeenAt:item.last_seen_at||null}))};
  }

  if(name==='atualizar_preferencias_notificacoes'){
    if(!TIME.test(args.horarioTarefas)) fail('Horário das tarefas inválido.'); const now=new Date().toISOString();
    await db.run(`INSERT INTO notification_preferences (user_id,enabled,task_enabled,event_enabled,task_time,task_days_before,event_minutes_before,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,task_enabled=excluded.task_enabled,event_enabled=excluded.event_enabled,task_time=excluded.task_time,task_days_before=excluded.task_days_before,event_minutes_before=excluded.event_minutes_before,updated_at=excluded.updated_at`,[userId,args.ativadas?1:0,args.tarefasAtivadas?1:0,args.eventosAtivados?1:0,args.horarioTarefas,args.diasAntesTarefas,args.minutosAntesEventos,now]);
    return executeSystemTool('obter_configuracao_notificacoes',{},context);
  }

  if(name==='exportar_meus_dados'){
    const [calendars,memberships,eventsCreated,boards,tasksCreated,tasksAssigned,preferences,devices]=await Promise.all([
      db.all('SELECT id,name,color,is_private,is_default,is_task_calendar,created_at FROM calendars WHERE owner_id=$1',[userId]),
      db.all('SELECT calendar_id,permission FROM calendar_members WHERE user_id=$1',[userId]),
      db.all('SELECT id,calendar_id,title,description,date,end_date,start_time,end_time,color,category,all_day,created_at FROM events WHERE created_by=$1',[userId]),
      db.all('SELECT id,name,description,color,scope_type,team_id,created_at FROM kanban_boards WHERE owner_id=$1',[userId]),
      db.all('SELECT id,board_id,column_id,title,description,due_date,priority,labels,checklist,created_at FROM kanban_tasks WHERE created_by=$1',[userId]),
      db.all('SELECT id,board_id,column_id,title,description,due_date,priority FROM kanban_tasks WHERE assignee_id=$1 AND created_by!=$1',[userId]),
      db.get('SELECT enabled,task_enabled,event_enabled,task_time,task_days_before,event_minutes_before,updated_at FROM notification_preferences WHERE user_id=$1',[userId]),
      db.all('SELECT id,name,enabled,created_at,last_seen_at FROM notification_devices WHERE user_id=$1',[userId]),
    ]);
    return {metadata:{generatedAt:new Date().toISOString(),subjectId:userId,legalFramework:'LGPD — Lei nº 13.709/2018, Art. 18',format:'JSON'},profile:{userId},calendars:{owned:calendars,memberships},events:eventsCreated,kanban:{boardsOwned:boards,tasksCreated,tasksAssigned},notifications:{preferences:preferences||null,registeredDevices:devices}};
  }

  fail(`Ferramenta desconhecida: ${name}`);
}

const common = { openWorldHint: false };
const read = { ...common, readOnlyHint: true };
const write = { ...common, readOnlyHint: false, destructiveHint: false };
const destructive = { ...common, readOnlyHint: false, destructiveHint: true };
const memberSchema = z.object({ userId:z.string().min(1), permissao:z.enum(['editor','viewer']).default('editor') });

const systemToolDefinitions = [
  {name:'obter_contexto_completo',title:'Obter contexto completo',description:'Retorna estrutura, permissões, agendas, equipes, quadros, convites, notificações e totais do usuário.',schema:z.object({}),annotations:read},
  {name:'obter_agenda',title:'Obter agenda',description:'Obtém uma agenda, seus membros e total de eventos.',schema:z.object({agendaId:z.string()}),annotations:read},
  {name:'criar_agenda',title:'Criar agenda',description:'Cria agenda e envia convites opcionais.',schema:z.object({nome:z.string().min(1).max(80),cor:z.string().regex(HEX_COLOR).default('#4f46e5'),privada:z.boolean().default(true),membros:z.array(memberSchema).max(200).default([])}),annotations:write},
  {name:'atualizar_agenda',title:'Atualizar agenda',description:'Atualiza nome, cor ou privacidade conforme a permissão.',schema:z.object({agendaId:z.string(),nome:z.string().min(1).max(80).optional(),cor:z.string().regex(HEX_COLOR).optional(),privada:z.boolean().optional()}),annotations:write},
  {name:'excluir_agenda',title:'Excluir agenda',description:'Exclui agenda comum, eventos e anexos. A padrão e a de tarefas não podem ser excluídas.',schema:z.object({agendaId:z.string(),confirmar:z.literal(true)}),annotations:destructive},
  {name:'listar_membros_agenda',title:'Listar membros da agenda',description:'Lista IDs e permissões dos membros.',schema:z.object({agendaId:z.string()}),annotations:read},
  {name:'listar_convites_agenda',title:'Listar convites de agenda',description:'Sem agendaId lista convites recebidos; com agendaId lista convites administrados pelo proprietário.',schema:z.object({agendaId:z.string().optional()}),annotations:read},
  {name:'convidar_membro_agenda',title:'Convidar para agenda',description:'Convida usuário para uma agenda comum.',schema:z.object({agendaId:z.string(),usuarioId:z.string(),permissao:z.enum(['editor','viewer']).default('viewer')}),annotations:write},
  {name:'responder_convite_agenda',title:'Responder convite de agenda',description:'Aceita ou recusa convite recebido.',schema:z.object({conviteId:z.string(),aceitar:z.boolean()}),annotations:write},
  {name:'alterar_membro_agenda',title:'Alterar membro da agenda',description:'Altera a permissão de membro não proprietário.',schema:z.object({agendaId:z.string(),membroId:z.string(),permissao:z.enum(['editor','viewer'])}),annotations:write},
  {name:'remover_membro_agenda',title:'Remover membro da agenda',description:'Remove membro não proprietário.',schema:z.object({agendaId:z.string(),membroId:z.string(),confirmar:z.literal(true)}),annotations:destructive},
  {name:'listar_equipes',title:'Listar equipes',description:'Lista equipes acessíveis e seus quadros.',schema:z.object({}),annotations:read},
  {name:'obter_equipe',title:'Obter equipe',description:'Obtém equipe e membros.',schema:z.object({equipeId:z.string()}),annotations:read},
  {name:'criar_equipe',title:'Criar equipe',description:'Cria equipe, agenda de tarefas, quadro e colunas padrão.',schema:z.object({nome:z.string().min(1).max(80),descricao:z.string().max(1000).default(''),cor:z.string().regex(HEX_COLOR).default('#4f46e5')}),annotations:write},
  {name:'atualizar_equipe',title:'Atualizar equipe',description:'Atualiza equipe administrada pelo usuário.',schema:z.object({equipeId:z.string(),nome:z.string().min(1).max(80).optional(),descricao:z.string().max(1000).optional(),cor:z.string().regex(HEX_COLOR).optional()}),annotations:write},
  {name:'excluir_equipe',title:'Excluir equipe',description:'Exclui equipe, quadro, tarefas, agenda e anexos vinculados.',schema:z.object({equipeId:z.string(),confirmar:z.literal(true)}),annotations:destructive},
  {name:'listar_membros_equipe',title:'Listar membros da equipe',description:'Lista membros e papéis da equipe.',schema:z.object({equipeId:z.string()}),annotations:read},
  {name:'listar_convites_equipe',title:'Listar convites de equipe',description:'Sem equipeId lista recebidos; com equipeId lista os administrados.',schema:z.object({equipeId:z.string().optional()}),annotations:read},
  {name:'convidar_membro_equipe',title:'Convidar para equipe',description:'Convida usuário para equipe administrada.',schema:z.object({equipeId:z.string(),usuarioId:z.string()}),annotations:write},
  {name:'responder_convite_equipe',title:'Responder convite de equipe',description:'Aceita ou recusa convite recebido.',schema:z.object({conviteId:z.string(),aceitar:z.boolean()}),annotations:write},
  {name:'remover_membro_equipe',title:'Remover membro da equipe',description:'Remove membro e suas atribuições de tarefas.',schema:z.object({equipeId:z.string(),membroId:z.string(),confirmar:z.literal(true)}),annotations:destructive},
  {name:'obter_quadro',title:'Obter quadro completo',description:'Retorna quadro, colunas, tarefas, checklist e anexos.',schema:z.object({quadroId:z.string()}),annotations:read},
  {name:'criar_quadro',title:'Criar quadro pessoal',description:'Cria quadro pessoal com três colunas padrão.',schema:z.object({nome:z.string().min(1).max(80),descricao:z.string().max(1000).default(''),cor:z.string().regex(HEX_COLOR).default('#4f46e5')}),annotations:write},
  {name:'atualizar_quadro',title:'Atualizar quadro',description:'Atualiza nome, descrição ou cor.',schema:z.object({quadroId:z.string(),nome:z.string().min(1).max(80).optional(),descricao:z.string().max(1000).optional(),cor:z.string().regex(HEX_COLOR).optional()}),annotations:write},
  {name:'excluir_quadro',title:'Excluir quadro pessoal',description:'Exclui quadro pessoal, tarefas, prazos e anexos.',schema:z.object({quadroId:z.string(),confirmar:z.literal(true)}),annotations:destructive},
  {name:'criar_coluna',title:'Criar coluna',description:'Adiciona coluna ao quadro.',schema:z.object({quadroId:z.string(),titulo:z.string().min(1).max(60),cor:z.string().regex(HEX_COLOR).default('#64748b')}),annotations:write},
  {name:'atualizar_coluna',title:'Atualizar coluna',description:'Atualiza título, cor ou posição.',schema:z.object({colunaId:z.string(),titulo:z.string().min(1).max(60).optional(),cor:z.string().regex(HEX_COLOR).optional(),posicao:z.number().int().min(0).optional()}),annotations:write},
  {name:'excluir_coluna',title:'Excluir coluna',description:'Exclui somente quando todos os cartões e subtarefas estiverem arquivados.',schema:z.object({colunaId:z.string(),confirmar:z.literal(true)}),annotations:destructive},
  {name:'listar_lixeira_tarefas',title:'Listar lixeira de tarefas',description:'Lista raízes excluídas; itens expiram em 30 dias.',schema:z.object({quadroId:z.string()}),annotations:read},
  {name:'restaurar_tarefa',title:'Restaurar tarefa',description:'Restaura tarefa e subtarefas da lixeira.',schema:z.object({tarefaId:z.string()}),annotations:write},
  {name:'excluir_tarefa_permanentemente',title:'Excluir tarefa permanentemente',description:'Apaga definitivamente uma tarefa já na lixeira, suas subtarefas e anexos.',schema:z.object({tarefaId:z.string(),confirmar:z.literal(true)}),annotations:destructive},
  {name:'listar_anexos',title:'Listar anexos',description:'Lista metadados dos anexos de evento ou tarefa; nunca expõe conteúdo binário automaticamente.',schema:z.object({tipo:z.enum(['event','task']),itemId:z.string()}),annotations:read},
  {name:'excluir_anexo',title:'Excluir anexo',description:'Exclui anexo quando o usuário tem escrita no item.',schema:z.object({anexoId:z.string(),confirmar:z.literal(true)}),annotations:destructive},
  {name:'obter_configuracao_notificacoes',title:'Obter notificações',description:'Retorna preferências e dispositivos sem segredos de autenticação.',schema:z.object({}),annotations:read},
  {name:'atualizar_preferencias_notificacoes',title:'Atualizar notificações',description:'Define ativação e antecedência de alertas.',schema:z.object({ativadas:z.boolean(),tarefasAtivadas:z.boolean(),eventosAtivados:z.boolean(),horarioTarefas:z.string().regex(TIME),diasAntesTarefas:z.number().int().min(0).max(30),minutosAntesEventos:z.number().int().min(0).max(1440)}),annotations:write},
  {name:'exportar_meus_dados',title:'Exportar meus dados',description:'Retorna a exportação estruturada do titular conforme a LGPD, sem chaves secretas.',schema:z.object({}),annotations:read},
];

const SYSTEM_MANUAL = `# Modelo completo da Agenda Corporativa

## Entidades e relações
- Agenda contém eventos, membros e convites. Permissões: owner, editor e viewer.
- Equipe contém membros e possui automaticamente um quadro compartilhado e uma agenda Tarefas.
- Quadro contém colunas; colunas contêm tarefas; tarefas podem ter subtarefas, responsáveis, checklist, etiquetas, prazo e anexos.
- Prazos de tarefas geram eventos de sistema. Altere esses prazos no card, nunca diretamente no evento.
- Anexos pertencem a um evento ou tarefa. O MCP lista metadados, mas não injeta binários no contexto.
- Notificações usam preferências do usuário e dispositivos registrados. Chaves e hashes nunca são expostos.
- O banco da Agenda armazena IDs de usuários, não cópias de nome, e-mail ou avatar. Esses dados são resolvidos pelo diretório corporativo SSO na interface; não invente nomes quando apenas um ID estiver disponível.
- Cadastro de dispositivo gera uma chave secreta de uso único; upload e download de binários usam a API REST autenticada, não o contexto textual MCP.
- A anonimização LGPD revoga dispositivos e preferências, limpa convites e atribuições. Por ser uma ação ampla sobre a conta, ela permanece no fluxo explícito da interface/API e não é automatizada por ferramenta de IA.

## Regras de acesso
- Viewer consulta; editor altera agenda/eventos; owner também gerencia privacidade e membros.
- Em equipe, admin gerencia estrutura e membros; member trabalha no quadro.
- Quadros pessoais pertencem ao criador. Quadros de equipe são excluídos somente junto da equipe.
- Agenda padrão permanece privada e não pode ser excluída.
- Agenda Tarefas é automática e seus membros vêm da equipe.
- Exclusões destrutivas exigem confirmar=true. A lixeira de tarefas retém itens por 30 dias.

## Formatos
- Datas: YYYY-MM-DD. Horas: HH:MM. Fuso padrão configurado no servidor.
- Cores de agenda/quadro/equipe/coluna: hexadecimal #RRGGBB.
- Descrições de evento e tarefa aceitam Markdown, incluindo títulos, listas, citações, tabelas e quebras de linha.
- Nunca invente agendas, equipes, cards, responsáveis ou estados; consulte as ferramentas e informe claramente quando não houver dados.
`;

module.exports = { executeSystemTool, systemToolDefinitions, SYSTEM_MANUAL };
