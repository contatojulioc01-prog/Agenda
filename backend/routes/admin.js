const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const db = require('../db');
const asyncRoute = require('../async-route');
const { formatLocalTimestamp } = require('../services/log-buffer');

const BANNER_SETTING_KEY = 'maintenance_banner';

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Normaliza roles vindas do SSO corporativo (suporta string[] ou Array<{ id, name }>).
 */
function normalizeRoles(rawRoles) {
  if (!Array.isArray(rawRoles)) return [];
  const normalized = [];
  for (const item of rawRoles) {
    if (typeof item === 'string' && item.trim()) {
      normalized.push(item.trim());
    } else if (item && typeof item === 'object') {
      const candidate = item.name || item.role || item.code || item.label;
      if (typeof candidate === 'string' && candidate.trim()) {
        normalized.push(candidate.trim());
      }
    }
  }
  return Array.from(new Set(normalized));
}

function hasDevRole(rawRoles) {
  return normalizeRoles(rawRoles).some(role => role.toUpperCase() === 'DEV');
}

function requireDevRole(req, res, next) {
  const roles = normalizeRoles(req.user?.roles || []);
  const isDev = Boolean(req.user?.isDev) || hasDevRole(roles);
  if (!isDev) {
    return res.status(403).json({ error: 'Acesso restrito a desenvolvedores (role DEV).' });
  }
  return next();
}

async function recordAudit(req, action, { targetType = null, targetId = null, details = {} } = {}, store = db) {
  const actorUserId = String(req.user?.id || req.headers['x-user-id'] || 'unknown');
  const actorName = String(req.user?.name || req.user?.email || actorUserId);
  const ipAddress = String(req.ip || req.socket?.remoteAddress || '');
  const now = formatLocalTimestamp();
  await store.run(
    `INSERT INTO admin_audit_logs (id, actor_user_id, actor_name, action, target_type, target_id, details, ip_address, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [makeId('audit'), actorUserId, actorName, action, targetType, targetId, JSON.stringify(details || {}), ipAddress, now]
  );
}

async function getMaintenanceBanner(store = db) {
  const row = await store.get('SELECT value, updated_by, updated_at FROM system_settings WHERE key = $1', [BANNER_SETTING_KEY]);
  if (!row) {
    return { enabled: false, message: '', level: 'info', updatedBy: null, updatedAt: null };
  }
  try {
    const parsed = JSON.parse(row.value || '{}');
    return {
      enabled: Boolean(parsed.enabled),
      message: String(parsed.message || ''),
      level: ['info', 'warning', 'danger'].includes(parsed.level) ? parsed.level : 'info',
      updatedBy: row.updated_by || null,
      updatedAt: row.updated_at || null,
    };
  } catch {
    return { enabled: false, message: '', level: 'info', updatedBy: row.updated_by || null, updatedAt: row.updated_at || null };
  }
}

function createAdminRouter({
  wss = { clients: new Set() },
  realtimeClients = new Set(),
  authCache = new Map(),
  broadcast = () => {},
  appVersion = 'unknown',
  portalApi = 'http://192.168.13.244:7000',
  ssoApiKey = '',
  logBuffer = null,
  fetchImpl = global.fetch,
} = {}) {
  const router = express.Router();

  // ── 1. Saúde do Sistema & Tempo Real ───────────────────────────────────────

  router.get('/overview', asyncRoute(async (_req, res) => {
    const dbStart = Date.now();
    await db.get('SELECT 1 AS ok');
    const dbLatencyMs = Date.now() - dbStart;

    const mem = process.memoryUsage();
    const poolStats = db.getPoolStats();
    const banner = await getMaintenanceBanner();

    const onlineMap = new Map();
    for (const client of wss.clients || []) {
      if (client.readyState === 1 && client.userId) {
        const current = onlineMap.get(client.userId) || { userId: client.userId, websocket: 0, sse: 0 };
        current.websocket += 1;
        onlineMap.set(client.userId, current);
      }
    }
    for (const client of realtimeClients || []) {
      if (client.userId) {
        const current = onlineMap.get(client.userId) || { userId: client.userId, websocket: 0, sse: 0 };
        current.sse += 1;
        onlineMap.set(client.userId, current);
      }
    }

    res.json({
      version: appVersion,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'production',
      uptimeSeconds: Math.floor(process.uptime()),
      serverTime: formatLocalTimestamp(),
      memory: {
        rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
        heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
      },
      database: {
        ...poolStats,
        latencyMs: dbLatencyMs,
      },
      realtime: {
        websocketClients: wss.clients ? wss.clients.size : 0,
        sseClients: realtimeClients ? realtimeClients.size : 0,
        uniqueOnlineUsers: onlineMap.size,
        onlineUsers: Array.from(onlineMap.values()),
      },
      authCacheSize: authCache.size,
      banner,
    });
  }));

  router.get('/integrations/health', asyncRoute(async (_req, res) => {
    const checkHttp = async (name, url, options = {}) => {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetchImpl(url, { ...options, signal: controller.signal });
        return {
          name,
          url,
          status: response.ok || response.status < 500 ? 'ok' : 'degraded',
          httpStatus: response.status,
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        return {
          name,
          url,
          status: 'down',
          httpStatus: null,
          latencyMs: Date.now() - started,
          error: error.message,
        };
      } finally {
        clearTimeout(timer);
      }
    };

    const ssoHeaders = {};
    if (ssoApiKey) ssoHeaders['X-Api-Key'] = ssoApiKey;

    const ssoCheck = await checkHttp('SSO Portal Corporativo', `${portalApi}/api/auth/me`, { headers: ssoHeaders });

    const aiConfigured = Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_API_URL);
    const aiCheck = {
      name: 'Serviço de IA (/api/ai)',
      status: aiConfigured ? 'ok' : 'degraded',
      details: aiConfigured ? 'Credenciais de IA configuradas' : 'Nenhuma variável de IA configurada no .env',
      latencyMs: 0,
    };

    const mcpCheck = {
      name: 'Servidor MCP (/api/mcp)',
      status: 'ok',
      details: 'Endpoint HTTP MCP ativo no processo',
      latencyMs: 0,
    };

    res.json({
      checkedAt: formatLocalTimestamp(),
      integrations: [ssoCheck, aiCheck, mcpCheck],
    });
  }));

  router.post('/realtime/broadcast', asyncRoute(async (req, res) => {
    const title = String(req.body?.title || 'Aviso do Sistema').trim().slice(0, 120);
    const message = String(req.body?.message || '').trim().slice(0, 500);
    const level = ['info', 'warning', 'danger'].includes(req.body?.level) ? req.body.level : 'info';
    if (!message) {
      return res.status(400).json({ error: 'Informe a mensagem do aviso.' });
    }

    const payload = {
      type: 'ADMIN_BROADCAST',
      title,
      message,
      level,
      sentBy: req.user?.name || req.user?.id || 'DEV',
      sentAt: formatLocalTimestamp(),
    };
    broadcast(payload);
    await recordAudit(req, 'REALTIME_BROADCAST', { targetType: 'realtime', details: { title, level, message } });

    res.json({ success: true, payload });
  }));

  router.put('/system/banner', asyncRoute(async (req, res) => {
    const enabled = Boolean(req.body?.enabled);
    const message = String(req.body?.message || '').trim().slice(0, 400);
    const level = ['info', 'warning', 'danger'].includes(req.body?.level) ? req.body.level : 'info';

    if (enabled && !message) {
      return res.status(400).json({ error: 'Informe a mensagem do banner ao ativá-lo.' });
    }

    const now = formatLocalTimestamp();
    const updatedBy = String(req.user?.name || req.user?.id || 'DEV');
    const serialized = JSON.stringify({ enabled, message, level });

    await db.run(
      `INSERT INTO system_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
      [BANNER_SETTING_KEY, serialized, updatedBy, now]
    );

    const banner = { enabled, message, level, updatedBy, updatedAt: now };
    broadcast({ type: 'SYSTEM_BANNER_UPDATED', banner });
    await recordAudit(req, 'SET_MAINTENANCE_BANNER', { targetType: 'system_settings', targetId: BANNER_SETTING_KEY, details: banner });

    res.json({ success: true, banner });
  }));

  // ── 2. SSO, Sessões & Diagnóstico de Permissões ────────────────────────────

  router.get('/auth/cache', asyncRoute(async (_req, res) => {
    const now = Date.now();
    const entries = [];
    for (const [tokenKey, entry] of authCache.entries()) {
      const fingerprint = crypto.createHash('sha256').update(String(tokenKey)).digest('hex').slice(0, 12);
      entries.push({
        tokenFingerprint: fingerprint,
        userId: entry.userId,
        name: entry.name || null,
        email: entry.email || null,
        roles: normalizeRoles(entry.roles || []),
        isDev: hasDevRole(entry.roles || []),
        ttlSeconds: Math.max(0, Math.round((entry.expiresAt - now) / 1000)),
        expired: entry.expiresAt <= now,
      });
    }
    res.json({ total: entries.length, entries });
  }));

  router.delete('/auth/cache', asyncRoute(async (req, res) => {
    const targetUserId = String(req.query.userId || req.body?.userId || '').trim();
    let removed = 0;

    if (targetUserId) {
      for (const [key, entry] of authCache.entries()) {
        if (entry.userId === targetUserId) {
          authCache.delete(key);
          removed += 1;
        }
      }
    } else {
      removed = authCache.size;
      authCache.clear();
    }

    await recordAudit(req, 'CLEAR_AUTH_CACHE', {
      targetType: targetUserId ? 'user' : 'all',
      targetId: targetUserId || null,
      details: { removed },
    });

    res.json({ success: true, removed, remaining: authCache.size });
  }));

  router.get('/users/:userId/diagnostics', asyncRoute(async (req, res) => {
    const targetUserId = String(req.params.userId || '').trim();
    if (!targetUserId) return res.status(400).json({ error: 'userId obrigatório.' });

    const [
      ownedCalendars,
      memberCalendars,
      kanbanTeams,
      kanbanBoards,
      muralBoards,
      devices,
      pendingCalInvites,
      pendingTeamInvites,
    ] = await Promise.all([
      db.all('SELECT id, name, color, is_private, is_default, is_task_calendar FROM calendars WHERE owner_id = $1 ORDER BY name', [targetUserId]),
      db.all(
        `SELECT c.id, c.name, c.owner_id, cm.permission
         FROM calendar_members cm JOIN calendars c ON c.id = cm.calendar_id
         WHERE cm.user_id = $1 ORDER BY c.name`,
        [targetUserId]
      ),
      db.all(
        `SELECT t.id, t.name, t.owner_id, tm.role
         FROM kanban_team_members tm JOIN kanban_teams t ON t.id = tm.team_id
         WHERE tm.user_id = $1 ORDER BY t.name`,
        [targetUserId]
      ),
      db.all(
        `SELECT b.id, b.name, b.scope_type, b.owner_id, b.team_id
         FROM kanban_boards b
         WHERE b.owner_id = $1
            OR (b.scope_type = 'team' AND EXISTS (SELECT 1 FROM kanban_team_members tm WHERE tm.team_id = b.team_id AND tm.user_id = $1))
         ORDER BY b.name`,
        [targetUserId]
      ),
      db.all(
        `SELECT m.id, m.name, m.scope_type, m.owner_id, m.team_id
         FROM mural_boards m
         WHERE m.owner_id = $1
            OR (m.scope_type = 'team' AND EXISTS (SELECT 1 FROM kanban_team_members tm WHERE tm.team_id = m.team_id AND tm.user_id = $1))
         ORDER BY m.name`,
        [targetUserId]
      ),
      db.all('SELECT id, name, enabled, created_at, last_seen_at FROM notification_devices WHERE user_id = $1 ORDER BY created_at DESC', [targetUserId]),
      db.all('SELECT id, calendar_id, permission, status, created_at FROM calendar_invitations WHERE user_id = $1 AND status = $2', [targetUserId, 'pending']),
      db.all('SELECT id, team_id, invited_by, status, created_at FROM kanban_team_invitations WHERE user_id = $1 AND status = $2', [targetUserId, 'pending']),
    ]);

    res.json({
      userId: targetUserId,
      calendars: { owned: ownedCalendars, shared: memberCalendars },
      kanban: { teams: kanbanTeams, boards: kanbanBoards },
      murals: muralBoards,
      devices,
      pendingInvitations: { calendars: pendingCalInvites, teams: pendingTeamInvites },
    });
  }));

  // ── 3. Notificações & Agenda.Notifier.exe ──────────────────────────────────

  router.get('/notifications/devices', asyncRoute(async (req, res) => {
    const userIdFilter = String(req.query.userId || '').trim();
    const rows = userIdFilter
      ? await db.all(
          'SELECT id, user_id, name, enabled, created_at, last_seen_at FROM notification_devices WHERE user_id = $1 ORDER BY last_seen_at DESC NULLS LAST, created_at DESC',
          [userIdFilter]
        )
      : await db.all(
          'SELECT id, user_id, name, enabled, created_at, last_seen_at FROM notification_devices ORDER BY last_seen_at DESC NULLS LAST, created_at DESC LIMIT 200'
        );

    res.json({
      total: rows.length,
      devices: rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        enabled: row.enabled === 1,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at || null,
      })),
    });
  }));

  router.patch('/notifications/devices/:id/toggle', asyncRoute(async (req, res) => {
    const deviceId = String(req.params.id || '').trim();
    const device = await db.get('SELECT id, user_id, name, enabled FROM notification_devices WHERE id = $1', [deviceId]);
    if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado.' });

    const nextEnabled = typeof req.body?.enabled === 'boolean'
      ? (req.body.enabled ? 1 : 0)
      : (device.enabled === 1 ? 0 : 1);

    await db.run('UPDATE notification_devices SET enabled = $1 WHERE id = $2', [nextEnabled, deviceId]);
    await recordAudit(req, nextEnabled ? 'ENABLE_DEVICE' : 'REVOKE_DEVICE', {
      targetType: 'notification_device',
      targetId: deviceId,
      details: { userId: device.user_id, name: device.name, enabled: nextEnabled === 1 },
    });

    res.json({ success: true, id: deviceId, enabled: nextEnabled === 1 });
  }));

  router.get('/notifications/deliveries', asyncRoute(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const userIdFilter = String(req.query.userId || '').trim();
    const rows = userIdFilter
      ? await db.all(
          `SELECT id, device_id, user_id, source_type, source_id, occurrence_date, scheduled_for, delivered_at
           FROM notification_deliveries WHERE user_id = $1 ORDER BY delivered_at DESC LIMIT $2`,
          [userIdFilter, limit]
        )
      : await db.all(
          `SELECT id, device_id, user_id, source_type, source_id, occurrence_date, scheduled_for, delivered_at
           FROM notification_deliveries ORDER BY delivered_at DESC LIMIT $1`,
          [limit]
        );

    res.json({ total: rows.length, deliveries: rows });
  }));

  router.post('/notifications/test', asyncRoute(async (req, res) => {
    const targetUserId = String(req.body?.userId || '').trim();
    const message = String(req.body?.message || 'Notificação de teste enviada pelo Painel Admin (DEV).').trim().slice(0, 300);
    if (!targetUserId) return res.status(400).json({ error: 'Informe o userId de destino.' });

    const payload = {
      type: 'ADMIN_TEST_NOTIFICATION',
      userId: targetUserId,
      title: 'Teste de Notificação (DEV)',
      message,
      sentAt: formatLocalTimestamp(),
    };
    broadcast(payload);
    await recordAudit(req, 'SEND_TEST_NOTIFICATION', { targetType: 'user', targetId: targetUserId, details: { message } });

    res.json({ success: true, payload });
  }));

  // ── 4. Armazenamento, Anexos, Lixeira Global & Migrações ───────────────────

  router.get('/storage/summary', asyncRoute(async (_req, res) => {
    const tableQueries = [
      ['calendars', 'SELECT COUNT(*)::int AS count FROM calendars'],
      ['events', 'SELECT COUNT(*)::int AS count FROM events'],
      ['kanban_teams', 'SELECT COUNT(*)::int AS count FROM kanban_teams'],
      ['kanban_boards', 'SELECT COUNT(*)::int AS count FROM kanban_boards'],
      ['kanban_tasks', 'SELECT COUNT(*)::int AS count FROM kanban_tasks WHERE deleted_at IS NULL'],
      ['kanban_tasks_trash', 'SELECT COUNT(*)::int AS count FROM kanban_tasks WHERE deleted_at IS NOT NULL'],
      ['mural_boards', 'SELECT COUNT(*)::int AS count FROM mural_boards'],
      ['mural_items', 'SELECT COUNT(*)::int AS count FROM mural_items'],
      ['attachments', 'SELECT COUNT(*)::int AS count FROM attachments'],
      ['notification_devices', 'SELECT COUNT(*)::int AS count FROM notification_devices'],
      ['notification_deliveries', 'SELECT COUNT(*)::int AS count FROM notification_deliveries'],
      ['admin_audit_logs', 'SELECT COUNT(*)::int AS count FROM admin_audit_logs'],
    ];

    const tableCounts = await Promise.all(
      tableQueries.map(async ([table, sql]) => {
        const row = await db.get(sql);
        return { table, count: Number(row?.count || 0) };
      })
    );

    const [attachmentStats, largestAttachments, orphanRow] = await Promise.all([
      db.get(`
        SELECT
          COUNT(*)::int AS total_count,
          COALESCE(SUM(byte_size), 0)::bigint AS total_bytes,
          COUNT(*) FILTER (WHERE content IS NOT NULL)::int AS legacy_db_count,
          COUNT(*) FILTER (WHERE file_path IS NOT NULL)::int AS disk_count
        FROM attachments
      `),
      db.all(`
        SELECT id, owner_type, owner_id, file_name, mime_type, byte_size, created_by, created_at
        FROM attachments ORDER BY byte_size DESC LIMIT 10
      `),
      db.get(`
        SELECT COUNT(*)::int AS orphan_count, COALESCE(SUM(byte_size), 0)::bigint AS orphan_bytes
        FROM attachments a
        WHERE (a.owner_type = 'event' AND NOT EXISTS (SELECT 1 FROM events e WHERE e.id = a.owner_id))
           OR (a.owner_type = 'task' AND NOT EXISTS (SELECT 1 FROM kanban_tasks t WHERE t.id = a.owner_id))
           OR (a.owner_type = 'mural_item' AND NOT EXISTS (SELECT 1 FROM mural_items m WHERE m.id = a.owner_id))
      `),
    ]);

    res.json({
      tables: tableCounts,
      attachments: {
        totalCount: Number(attachmentStats?.total_count || 0),
        totalBytes: Number(attachmentStats?.total_bytes || 0),
        legacyDbCount: Number(attachmentStats?.legacy_db_count || 0),
        diskCount: Number(attachmentStats?.disk_count || 0),
        orphanCount: Number(orphanRow?.orphan_count || 0),
        orphanBytes: Number(orphanRow?.orphan_bytes || 0),
        largest: largestAttachments,
      },
    });
  }));

  router.post('/storage/cleanup-orphans', asyncRoute(async (req, res) => {
    const dryRun = req.body?.dryRun !== false;
    const orphans = await db.all(`
      SELECT id, owner_type, owner_id, file_name, byte_size, file_path
      FROM attachments a
      WHERE (a.owner_type = 'event' AND NOT EXISTS (SELECT 1 FROM events e WHERE e.id = a.owner_id))
         OR (a.owner_type = 'task' AND NOT EXISTS (SELECT 1 FROM kanban_tasks t WHERE t.id = a.owner_id))
         OR (a.owner_type = 'mural_item' AND NOT EXISTS (SELECT 1 FROM mural_items m WHERE m.id = a.owner_id))
    `);

    const totalBytes = orphans.reduce((acc, item) => acc + Number(item.byte_size || 0), 0);
    if (dryRun) {
      return res.json({ dryRun: true, count: orphans.length, totalBytes, items: orphans.slice(0, 50) });
    }

    let diskDeleted = 0;
    await db.transaction(async tx => {
      for (const orphan of orphans) {
        await tx.run('DELETE FROM attachments WHERE id = $1', [orphan.id]);
      }
    });

    for (const orphan of orphans) {
      if (orphan.file_path && fs.existsSync(orphan.file_path)) {
        try {
          await fs.promises.unlink(orphan.file_path);
          diskDeleted += 1;
        } catch {}
      }
    }

    await recordAudit(req, 'PURGE_ORPHAN_ATTACHMENTS', {
      targetType: 'attachments',
      details: { removedCount: orphans.length, diskDeleted, freedBytes: totalBytes },
    });

    res.json({ dryRun: false, removedCount: orphans.length, diskDeleted, freedBytes: totalBytes });
  }));

  router.get('/trash/tasks', asyncRoute(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const search = String(req.query.q || '').trim().toLowerCase();

    const rows = search
      ? await db.all(
          `SELECT t.id, t.board_id, b.name AS board_name, t.title, t.priority, t.deleted_at, t.deleted_by, t.created_by
           FROM kanban_tasks t LEFT JOIN kanban_boards b ON b.id = t.board_id
           WHERE t.deleted_at IS NOT NULL AND LOWER(t.title) LIKE $1
           ORDER BY t.deleted_at DESC LIMIT $2`,
          [`%${search}%`, limit]
        )
      : await db.all(
          `SELECT t.id, t.board_id, b.name AS board_name, t.title, t.priority, t.deleted_at, t.deleted_by, t.created_by
           FROM kanban_tasks t LEFT JOIN kanban_boards b ON b.id = t.board_id
           WHERE t.deleted_at IS NOT NULL
           ORDER BY t.deleted_at DESC LIMIT $1`,
          [limit]
        );

    res.json({ total: rows.length, tasks: rows });
  }));

  router.post('/trash/tasks/:id/restore', asyncRoute(async (req, res) => {
    const taskId = String(req.params.id || '').trim();
    const task = await db.get('SELECT id, title, board_id, deleted_at FROM kanban_tasks WHERE id = $1', [taskId]);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    if (!task.deleted_at) return res.status(400).json({ error: 'Esta tarefa não está na lixeira.' });

    const now = formatLocalTimestamp();
    await db.run('UPDATE kanban_tasks SET deleted_at = NULL, deleted_by = NULL, updated_at = $1 WHERE id = $2', [now, taskId]);
    broadcast({ type: 'KANBAN_UPDATED', boardId: task.board_id });
    await recordAudit(req, 'RESTORE_TRASH_TASK', { targetType: 'kanban_task', targetId: taskId, details: { title: task.title, boardId: task.board_id } });

    res.json({ success: true, id: taskId });
  }));

  router.delete('/trash/tasks/:id', asyncRoute(async (req, res) => {
    const taskId = String(req.params.id || '').trim();
    const task = await db.get('SELECT id, title, board_id, deleted_at FROM kanban_tasks WHERE id = $1', [taskId]);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    if (!task.deleted_at) return res.status(400).json({ error: 'Apenas tarefas na lixeira podem ser expurgadas.' });

    await db.transaction(async tx => {
      await tx.run('DELETE FROM kanban_tasks WHERE id = $1 OR parent_task_id = $1', [taskId]);
    });
    broadcast({ type: 'KANBAN_UPDATED', boardId: task.board_id });
    await recordAudit(req, 'PURGE_TRASH_TASK', { targetType: 'kanban_task', targetId: taskId, details: { title: task.title, boardId: task.board_id } });

    res.json({ success: true, id: taskId });
  }));

  router.get('/migrations', asyncRoute(async (_req, res) => {
    const migrations = await db.all('SELECT id, applied_at FROM agenda_migrations ORDER BY applied_at DESC');
    res.json({ total: migrations.length, migrations });
  }));

  // ── 5. Suporte Operacional (Ownership & Convites) ──────────────────────────

  router.post('/ownership/transfer', asyncRoute(async (req, res) => {
    const resourceType = String(req.body?.resourceType || '').trim();
    const resourceId = String(req.body?.resourceId || '').trim();
    const newOwnerId = String(req.body?.newOwnerId || '').trim();

    const resourceTableMap = {
      calendar: { table: 'calendars', label: 'Calendário' },
      kanban_team: { table: 'kanban_teams', label: 'Equipe Kanban' },
      kanban_board: { table: 'kanban_boards', label: 'Quadro Kanban' },
      mural_board: { table: 'mural_boards', label: 'Mural' },
    };

    const meta = resourceTableMap[resourceType];
    if (!meta) {
      return res.status(400).json({ error: 'resourceType inválido. Use calendar, kanban_team, kanban_board ou mural_board.' });
    }
    if (!resourceId || !newOwnerId) {
      return res.status(400).json({ error: 'Informe resourceId e newOwnerId.' });
    }

    const existing = await db.get(`SELECT id, name, owner_id FROM ${meta.table} WHERE id = $1`, [resourceId]);
    if (!existing) {
      return res.status(404).json({ error: `${meta.label} não encontrado.` });
    }
    if (existing.owner_id === newOwnerId) {
      return res.status(400).json({ error: 'O usuário informado já é o proprietário atual.' });
    }

    await db.transaction(async tx => {
      await tx.run(`UPDATE ${meta.table} SET owner_id = $1 WHERE id = $2`, [newOwnerId, resourceId]);

      if (resourceType === 'calendar') {
        await tx.run(
          `INSERT INTO calendar_members (id, calendar_id, user_id, permission)
           VALUES ($1, $2, $3, 'owner')
           ON CONFLICT (calendar_id, user_id) DO UPDATE SET permission = 'owner'`,
          [makeId('cm'), resourceId, newOwnerId]
        );
      } else if (resourceType === 'kanban_team') {
        await tx.run(
          `INSERT INTO kanban_team_members (id, team_id, user_id, role, joined_at)
           VALUES ($1, $2, $3, 'admin', $4)
           ON CONFLICT (team_id, user_id) DO UPDATE SET role = 'admin'`,
          [makeId('ktm'), resourceId, newOwnerId, formatLocalTimestamp()]
        );
      }

      await recordAudit(req, 'TRANSFER_OWNERSHIP', {
        targetType: resourceType,
        targetId: resourceId,
        details: { resourceName: existing.name, previousOwnerId: existing.owner_id, newOwnerId },
      }, tx);
    });

    broadcast({ type: 'OWNERSHIP_TRANSFERRED', resourceType, resourceId, newOwnerId });
    res.json({
      success: true,
      resourceType,
      resourceId,
      resourceName: existing.name,
      previousOwnerId: existing.owner_id,
      newOwnerId,
    });
  }));

  router.get('/invitations/pending', asyncRoute(async (_req, res) => {
    const [calendarInvites, teamInvites] = await Promise.all([
      db.all(
        `SELECT ci.id, ci.calendar_id AS resource_id, c.name AS resource_name, ci.user_id, ci.permission AS role, ci.created_at
         FROM calendar_invitations ci LEFT JOIN calendars c ON c.id = ci.calendar_id
         WHERE ci.status = 'pending' ORDER BY ci.created_at DESC LIMIT 100`
      ),
      db.all(
        `SELECT ti.id, ti.team_id AS resource_id, t.name AS resource_name, ti.user_id, ti.invited_by, ti.created_at
         FROM kanban_team_invitations ti LEFT JOIN kanban_teams t ON t.id = ti.team_id
         WHERE ti.status = 'pending' ORDER BY ti.created_at DESC LIMIT 100`
      ),
    ]);

    res.json({
      calendarInvitations: calendarInvites,
      teamInvitations: teamInvites,
    });
  }));

  router.delete('/invitations/:type/:id', asyncRoute(async (req, res) => {
    const type = String(req.params.type || '').trim();
    const inviteId = String(req.params.id || '').trim();
    if (!['calendar', 'team'].includes(type)) {
      return res.status(400).json({ error: 'Tipo de convite inválido. Use calendar ou team.' });
    }
    const table = type === 'calendar' ? 'calendar_invitations' : 'kanban_team_invitations';
    const existing = await db.get(`SELECT id, user_id FROM ${table} WHERE id = $1`, [inviteId]);
    if (!existing) return res.status(404).json({ error: 'Convite não encontrado.' });

    await db.run(`DELETE FROM ${table} WHERE id = $1`, [inviteId]);
    await recordAudit(req, 'CANCEL_INVITATION', { targetType: `${type}_invitation`, targetId: inviteId, details: { userId: existing.user_id } });

    res.json({ success: true, id: inviteId });
  }));

  // ── 6. Auditoria, Logs Recentes & Relatório LGPD ───────────────────────────

  router.get('/audit-logs', asyncRoute(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const actionFilter = String(req.query.action || '').trim();
    const rows = actionFilter
      ? await db.all(
          `SELECT id, actor_user_id, actor_name, action, target_type, target_id, details, ip_address, created_at
           FROM admin_audit_logs WHERE action = $1 ORDER BY created_at DESC LIMIT $2`,
          [actionFilter, limit]
        )
      : await db.all(
          `SELECT id, actor_user_id, actor_name, action, target_type, target_id, details, ip_address, created_at
           FROM admin_audit_logs ORDER BY created_at DESC LIMIT $1`,
          [limit]
        );

    res.json({
      total: rows.length,
      logs: rows.map(row => {
        let parsedDetails = {};
        try { parsedDetails = JSON.parse(row.details || '{}'); } catch {}
        return { ...row, details: parsedDetails };
      }),
    });
  }));

  router.get('/logs/recent', asyncRoute(async (req, res) => {
    const level = String(req.query.level || 'all').trim();
    const limit = Number(req.query.limit) || 100;
    const entries = logBuffer ? logBuffer.list({ level, limit }) : [];
    res.json({ total: entries.length, entries });
  }));

  router.get('/reports/lgpd', asyncRoute(async (req, res) => {
    const [
      usersWithPrefs,
      activeDevices,
      calendarsCount,
      eventsCount,
      tasksCount,
      attachmentsCount,
      auditCount,
    ] = await Promise.all([
      db.get('SELECT COUNT(*)::int AS count FROM notification_preferences'),
      db.get('SELECT COUNT(*)::int AS count FROM notification_devices WHERE enabled = 1'),
      db.get('SELECT COUNT(*)::int AS count FROM calendars'),
      db.get('SELECT COUNT(*)::int AS count FROM events'),
      db.get('SELECT COUNT(*)::int AS count FROM kanban_tasks'),
      db.get('SELECT COUNT(*)::int AS count FROM attachments'),
      db.get('SELECT COUNT(*)::int AS count FROM admin_audit_logs'),
    ]);

    await recordAudit(req, 'EXPORT_LGPD_SUMMARY', { targetType: 'report' });

    res.json({
      generatedAt: formatLocalTimestamp(),
      legalFramework: 'LGPD — Lei nº 13.709/2018',
      generatedBy: req.user?.name || req.user?.id || 'DEV',
      summary: {
        usersWithNotificationPreferences: Number(usersWithPrefs?.count || 0),
        activeNotificationDevices: Number(activeDevices?.count || 0),
        totalCalendars: Number(calendarsCount?.count || 0),
        totalEvents: Number(eventsCount?.count || 0),
        totalKanbanTasks: Number(tasksCount?.count || 0),
        totalAttachments: Number(attachmentsCount?.count || 0),
        totalAdminAuditLogs: Number(auditCount?.count || 0),
      },
      controls: {
        ssoCentralizedAuth: portalApi,
        devRoleRestrictedAdmin: true,
        parameterizedQueries: true,
        localDateAuditTrail: true,
      },
    });
  }));

  return router;
}

module.exports = {
  createAdminRouter,
  normalizeRoles,
  hasDevRole,
  requireDevRole,
  getMaintenanceBanner,
};
