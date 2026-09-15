const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const asyncRoute = require('../async-route');

const router = express.Router();
const deviceRouter = express.Router();
const TIME_PATTERN = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function id(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function deliveryKey(type, sourceId, occurrenceDate, scheduledFor) {
  return crypto.createHash('sha256').update(`${type}|${sourceId}|${occurrenceDate}|${scheduledFor}`).digest('hex');
}

function preferencesDto(row) {
  return {
    enabled: row ? row.enabled === 1 : true,
    taskEnabled: row ? row.task_enabled === 1 : true,
    eventEnabled: row ? row.event_enabled === 1 : true,
    taskTime: row?.task_time || '08:30',
    taskDaysBefore: Number(row?.task_days_before ?? 1),
    eventMinutesBefore: Number(row?.event_minutes_before ?? 15),
  };
}

function deviceDto(row) {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at || null,
  };
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function minutes(time) {
  const [hour, minute] = String(time).split(':').map(Number);
  return hour * 60 + minute;
}

async function getPreferences(userId) {
  return preferencesDto(await db.get('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]));
}

async function authenticateDevice(req, res, next) {
  const authorization = String(req.headers.authorization || '');
  const deviceKey = String(req.headers['x-device-key'] || req.headers['x-device-token'] || authorization.replace(/^Bearer\s+/i, '')).trim();
  if (!deviceKey) return res.status(401).json({ error: 'Chave do dispositivo obrigatória' });
  const device = await db.get('SELECT * FROM notification_devices WHERE token_hash = $1 AND enabled = 1', [tokenHash(deviceKey)]);
  if (!device) return res.status(401).json({ error: 'Chave do dispositivo inválida ou revogada' });
  req.notificationDevice = device;
  req.headers['x-user-id'] = device.user_id;
  await db.run('UPDATE notification_devices SET last_seen_at = $1 WHERE id = $2', [new Date().toISOString(), device.id]);
  next();
}

router.get('/', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const [preferences, devices] = await Promise.all([
    getPreferences(userId),
    db.all('SELECT * FROM notification_devices WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
  ]);
  res.json({ preferences, devices: devices.map(deviceDto) });
}));

router.put('/preferences', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const {
    enabled = true,
    taskEnabled = true,
    eventEnabled = true,
    taskTime = '08:30',
    taskDaysBefore = 1,
    eventMinutesBefore = 15,
  } = req.body || {};
  const lead = Number(eventMinutesBefore);
  const taskLead = Number(taskDaysBefore);
  if (!Number.isInteger(taskLead) || taskLead < 0 || taskLead > 30) return res.status(400).json({ error: 'A antecedência das tarefas deve estar entre 0 e 30 dias' });
  if (![enabled, taskEnabled, eventEnabled].every(value => typeof value === 'boolean')) {
    return res.status(400).json({ error: 'Preferências de ativação inválidas' });
  }
  if (!TIME_PATTERN.test(taskTime)) return res.status(400).json({ error: 'Horário das tarefas inválido' });
  if (!Number.isInteger(lead) || lead < 0 || lead > 1440) {
    return res.status(400).json({ error: 'A antecedência deve estar entre 0 e 1440 minutos' });
  }
  const now = new Date().toISOString();
  await db.run(`INSERT INTO notification_preferences
    (user_id, enabled, task_enabled, event_enabled, task_time, event_minutes_before, updated_at, task_days_before)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (user_id) DO UPDATE SET enabled = EXCLUDED.enabled, task_enabled = EXCLUDED.task_enabled,
      event_enabled = EXCLUDED.event_enabled, task_time = EXCLUDED.task_time,
      event_minutes_before = EXCLUDED.event_minutes_before, updated_at = EXCLUDED.updated_at,
      task_days_before = EXCLUDED.task_days_before`,
    [userId, enabled ? 1 : 0, taskEnabled ? 1 : 0, eventEnabled ? 1 : 0, taskTime, lead, now, taskLead]);
  res.json(await getPreferences(userId));
}));

router.post('/devices', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const name = String(req.body?.name || 'Meu computador').trim();
  if (!name || name.length > 80) return res.status(400).json({ error: 'Nome do computador inválido' });
  const deviceKey = crypto.randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  const deviceId = id('ndv');
  await db.run(`INSERT INTO notification_devices
    (id, user_id, name, token_hash, enabled, created_at) VALUES ($1, $2, $3, $4, 1, $5)`,
    [deviceId, userId, name, tokenHash(deviceKey), now]);
  res.status(201).json({ device: deviceDto({ id: deviceId, name, enabled: 1, created_at: now, last_seen_at: null }), deviceKey });
}));

router.delete('/devices/:deviceId', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const result = await db.run('DELETE FROM notification_devices WHERE id = $1 AND user_id = $2', [req.params.deviceId, userId]);
  if (!result.rowCount) return res.status(404).json({ error: 'Dispositivo não encontrado' });
  res.json({ success: true });
}));

deviceRouter.use(asyncRoute(authenticateDevice));

function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function taskUrl(task) {
  return `/tarefas/${encodeURIComponent(task.board_id)}?tarefa=${encodeURIComponent(task.id)}${task.parent_task_id ? `&ramificacao=${encodeURIComponent(task.parent_task_id)}` : ''}`;
}

// Device keys only expose boards the connected user can access in the web app.
deviceRouter.get('/kanban', asyncRoute(async (req, res) => {
  const uid = req.notificationDevice.user_id;
  const boards = await db.all(`SELECT DISTINCT kb.* FROM kanban_boards kb
    LEFT JOIN kanban_team_members ktm ON ktm.team_id = kb.team_id AND ktm.user_id = $1
    WHERE (COALESCE(kb.scope_type, 'personal') <> 'team' AND kb.owner_id = $1)
      OR (kb.scope_type = 'team' AND ktm.user_id = $1) ORDER BY kb.name`, [uid]);
  const result = [];
  for (const board of boards) {
    const columns = await db.all('SELECT id, title, color FROM kanban_columns WHERE board_id = $1 ORDER BY position, created_at', [board.id]);
    const tasks = await db.all(`SELECT id, board_id, column_id, parent_task_id, title, due_date FROM kanban_tasks
      WHERE board_id = $1 AND archived = 0 AND deleted_at IS NULL ORDER BY position, created_at`, [board.id]);
    result.push({ id: board.id, name: board.name, columns: columns.map(column => ({ ...column,
      tasks: tasks.filter(task => task.column_id === column.id).map(task => ({ id: task.id,
        title: task.title, dueDate: task.due_date, url: taskUrl(task) })) })) });
  }
  res.json({ boards: result });
}));

deviceRouter.get('/pending', asyncRoute(async (req, res) => {
  const device = req.notificationDevice;
  const userId = device.user_id;
  const localDate = String(req.query.date || '');
  const localTime = String(req.query.time || '');
  if (!DATE_PATTERN.test(localDate) || !TIME_PATTERN.test(localTime) ||
      !Number.isFinite(Date.parse(`${localDate}T00:00:00Z`)) || shiftDate(localDate, 0) !== localDate) {
    return res.status(400).json({ error: 'Data ou horário local inválido' });
  }

  const preferences = await getPreferences(userId);
  if (!preferences.enabled) return res.json({ notifications: [], pollSeconds: 60, preferences });
  const deliveredRows = await db.all(
    'SELECT delivery_key FROM notification_deliveries WHERE device_id = $1 AND occurrence_date >= $2 AND occurrence_date <= $3',
    [device.id, localDate, shiftDate(localDate, 1)]
  );
  const delivered = new Set(deliveredRows.map(row => row.delivery_key));
  const currentMinute = minutes(localTime);
  const notifications = [];

  if (preferences.taskEnabled && currentMinute >= minutes(preferences.taskTime)) {
    const tasks = await db.all(`SELECT DISTINCT kt.*, kb.name AS board_name
      FROM kanban_tasks kt
      JOIN kanban_boards kb ON kb.id = kt.board_id
      LEFT JOIN kanban_team_members ktm ON ktm.team_id = kb.team_id AND ktm.user_id = $1
      WHERE kt.due_date >= $2 AND kt.due_date <= $3 AND kt.archived = 0 AND kt.deleted_at IS NULL
        AND ((COALESCE(kb.scope_type, 'personal') <> 'team' AND kb.owner_id = $1)
          OR (kb.scope_type = 'team' AND ktm.user_id = $1))`,
      [userId, localDate, shiftDate(localDate, preferences.taskDaysBefore)]);
    for (const task of tasks) {
      const assignees = parseJson(task.assignee_ids, []);
      if (!assignees.length && task.assignee_id) assignees.push(task.assignee_id);
      if (assignees.length && !assignees.includes(userId)) continue;
      const scheduledFor = `${localDate}T${preferences.taskTime}:00`;
      const key = deliveryKey('task', task.id, localDate, scheduledFor);
      if (delivered.has(key)) continue;
      notifications.push({
        key,
        type: 'task',
        sourceId: task.id,
        occurrenceDate: localDate,
        scheduledFor,
        title: task.due_date === localDate ? 'Tarefa com prazo hoje' : 'Tarefa com prazo próximo',
        body: `${task.title} · ${task.board_name} · Prazo: ${task.due_date.split('-').reverse().join('/')}`,
        url: taskUrl(task),
      });
    }
  }

  if (preferences.eventEnabled) {
    const events = await db.all(`SELECT DISTINCT e.*, c.name AS calendar_name
      FROM events e
      JOIN calendars c ON c.id = e.calendar_id
      LEFT JOIN calendar_members cm ON cm.calendar_id = c.id AND cm.user_id = $1
      LEFT JOIN kanban_task_events kte ON kte.event_id = e.id
      WHERE kte.event_id IS NULL AND e.date <= $2 AND COALESCE(e.end_date, e.date) >= $3
        AND (c.owner_id = $4 OR cm.user_id = $5)`,
      [userId, shiftDate(localDate, 1), localDate, userId, userId]);
    for (const event of events) {
      for (const occurrenceDate of [localDate, shiftDate(localDate, 1)]) {
      if (event.date > occurrenceDate || (event.end_date || event.date) < occurrenceDate) continue;
      const dayTimes = parseJson(event.day_times, {});
      const occurrenceTime = event.all_day === 1
        ? preferences.taskTime
        : (dayTimes[occurrenceDate]?.startTime || (event.date === occurrenceDate ? event.start_time : preferences.taskTime));
      if (!TIME_PATTERN.test(occurrenceTime)) continue;
      const start = Date.parse(`${occurrenceDate}T${occurrenceTime}:00Z`);
      const scheduled = start - (event.all_day === 1 ? 0 : preferences.eventMinutesBefore) * 60000;
      const now = Date.parse(`${localDate}T${localTime}:00Z`);
      if (now < scheduled) continue;
      // Do not send a backlog of events that have already ended.
      const endTime = dayTimes[occurrenceDate]?.endTime || event.end_time || occurrenceTime;
      if (event.all_day !== 1 && now > Date.parse(`${occurrenceDate}T${endTime}:00Z`)) continue;
      const scheduledFor = new Date(scheduled).toISOString().slice(0, 19);
      const key = deliveryKey('event', event.id, occurrenceDate, scheduledFor);
      if (delivered.has(key)) continue;
      notifications.push({
        key,
        type: 'event',
        sourceId: event.id,
        occurrenceDate,
        scheduledFor,
        title: event.all_day === 1 ? 'Evento para hoje' : `Evento às ${occurrenceTime}`,
        body: `${event.title} · ${event.calendar_name} · ${occurrenceDate.split('-').reverse().join('/')}`,
        url: `/calendario/dia/${occurrenceDate}?agenda=${encodeURIComponent(event.calendar_id)}&evento=${encodeURIComponent(event.id)}`,
      });
      }
    }
  }

  res.json({ notifications, pollSeconds: 60, preferences });
}));

deviceRouter.post('/delivered', asyncRoute(async (req, res) => {
  const device = req.notificationDevice;
  const entries = req.body?.notifications;
  if (!Array.isArray(entries) || entries.length > 100) {
    return res.status(400).json({ error: 'Lista de notificações inválida' });
  }
  const valid = entries.filter(entry =>
    entry && /^[a-f0-9]{64}$/.test(String(entry.key || '')) &&
    ['task', 'event'].includes(entry.type) &&
    String(entry.sourceId || '').length <= 160 &&
    DATE_PATTERN.test(String(entry.occurrenceDate || '')) &&
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00$/.test(String(entry.scheduledFor || ''))
  );
  if (valid.length !== entries.length) return res.status(400).json({ error: 'Notificação inválida' });
  const now = new Date().toISOString();
  await db.transaction(async tx => {
    for (const entry of valid) {
      await tx.run(`INSERT INTO notification_deliveries
        (id, device_id, user_id, delivery_key, source_type, source_id, occurrence_date, scheduled_for, delivered_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (device_id, delivery_key) DO NOTHING`,
        [id('ndl'), device.id, device.user_id, entry.key, entry.type, entry.sourceId,
          entry.occurrenceDate, entry.scheduledFor, now]);
    }
    await tx.run("DELETE FROM notification_deliveries WHERE delivered_at::timestamptz < CURRENT_TIMESTAMP - INTERVAL '90 days'");
  });
  res.json({ success: true, delivered: valid.length });
}));

module.exports = { router, deviceRouter, authenticateDevice, deliveryKey };
