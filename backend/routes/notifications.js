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
  return preferencesDto(await db.get('SELECT * FROM notification_preferences WHERE user_id = ?', [userId]));
}

async function authenticateDevice(req, res, next) {
  const authorization = String(req.headers.authorization || '');
  const deviceKey = String(req.headers['x-device-key'] || req.headers['x-device-token'] || authorization.replace(/^Bearer\s+/i, '')).trim();
  if (!deviceKey) return res.status(401).json({ error: 'Chave do dispositivo obrigatória' });
  const device = await db.get('SELECT * FROM notification_devices WHERE token_hash = ? AND enabled = 1', [tokenHash(deviceKey)]);
  if (!device) return res.status(401).json({ error: 'Chave do dispositivo inválida ou revogada' });
  req.notificationDevice = device;
  req.headers['x-user-id'] = device.user_id;
  await db.run('UPDATE notification_devices SET last_seen_at = ? WHERE id = ?', [new Date().toISOString(), device.id]);
  next();
}

router.get('/', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const [preferences, devices] = await Promise.all([
    getPreferences(userId),
    db.all('SELECT * FROM notification_devices WHERE user_id = ? ORDER BY created_at DESC', [userId]),
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
    eventMinutesBefore = 15,
  } = req.body || {};
  const lead = Number(eventMinutesBefore);
  if (![enabled, taskEnabled, eventEnabled].every(value => typeof value === 'boolean')) {
    return res.status(400).json({ error: 'Preferências de ativação inválidas' });
  }
  if (!TIME_PATTERN.test(taskTime)) return res.status(400).json({ error: 'Horário das tarefas inválido' });
  if (!Number.isInteger(lead) || lead < 0 || lead > 1440) {
    return res.status(400).json({ error: 'A antecedência deve estar entre 0 e 1440 minutos' });
  }
  const now = new Date().toISOString();
  await db.run(`INSERT INTO notification_preferences
    (user_id, enabled, task_enabled, event_enabled, task_time, event_minutes_before, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET enabled = EXCLUDED.enabled, task_enabled = EXCLUDED.task_enabled,
      event_enabled = EXCLUDED.event_enabled, task_time = EXCLUDED.task_time,
      event_minutes_before = EXCLUDED.event_minutes_before, updated_at = EXCLUDED.updated_at`,
    [userId, enabled ? 1 : 0, taskEnabled ? 1 : 0, eventEnabled ? 1 : 0, taskTime, lead, now]);
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
    (id, user_id, name, token_hash, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)`,
    [deviceId, userId, name, tokenHash(deviceKey), now]);
  res.status(201).json({ device: deviceDto({ id: deviceId, name, enabled: 1, created_at: now, last_seen_at: null }), deviceKey });
}));

router.delete('/devices/:deviceId', asyncRoute(async (req, res) => {
  const userId = req.headers['x-user-id'];
  const result = await db.run('DELETE FROM notification_devices WHERE id = ? AND user_id = ?', [req.params.deviceId, userId]);
  if (!result.rowCount) return res.status(404).json({ error: 'Dispositivo não encontrado' });
  res.json({ success: true });
}));

deviceRouter.use(asyncRoute(authenticateDevice));

deviceRouter.get('/pending', asyncRoute(async (req, res) => {
  const device = req.notificationDevice;
  const userId = device.user_id;
  const localDate = String(req.query.date || '');
  const localTime = String(req.query.time || '');
  if (!DATE_PATTERN.test(localDate) || !TIME_PATTERN.test(localTime)) {
    return res.status(400).json({ error: 'Data ou horário local inválido' });
  }

  const preferences = await getPreferences(userId);
  if (!preferences.enabled) return res.json({ notifications: [], pollSeconds: 60, preferences });
  const deliveredRows = await db.all(
    'SELECT delivery_key FROM notification_deliveries WHERE device_id = ? AND occurrence_date = ?',
    [device.id, localDate]
  );
  const delivered = new Set(deliveredRows.map(row => row.delivery_key));
  const currentMinute = minutes(localTime);
  const notifications = [];

  if (preferences.taskEnabled && currentMinute >= minutes(preferences.taskTime)) {
    const tasks = await db.all(`SELECT DISTINCT kt.*, kb.name AS board_name
      FROM kanban_tasks kt
      JOIN kanban_boards kb ON kb.id = kt.board_id
      LEFT JOIN kanban_team_members ktm ON ktm.team_id = kb.team_id AND ktm.user_id = ?
      WHERE kt.due_date = ? AND kt.archived = 0 AND kt.deleted_at IS NULL
        AND (kb.owner_id = ? OR ktm.user_id = ?)`,
      [userId, localDate, userId, userId]);
    for (const task of tasks) {
      const assignees = parseJson(task.assignee_ids, []);
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
        title: 'Tarefa com prazo hoje',
        body: `${task.title} · ${task.board_name}`,
        url: `/tarefas/${encodeURIComponent(task.board_id)}?tarefa=${encodeURIComponent(task.id)}${task.parent_task_id ? `&ramificacao=${encodeURIComponent(task.parent_task_id)}` : ''}`,
      });
    }
  }

  if (preferences.eventEnabled) {
    const events = await db.all(`SELECT DISTINCT e.*, c.name AS calendar_name
      FROM events e
      JOIN calendars c ON c.id = e.calendar_id
      LEFT JOIN calendar_members cm ON cm.calendar_id = c.id AND cm.user_id = ?
      LEFT JOIN kanban_task_events kte ON kte.event_id = e.id
      WHERE kte.event_id IS NULL AND e.date <= ? AND COALESCE(e.end_date, e.date) >= ?
        AND (c.owner_id = ? OR cm.user_id = ?)`,
      [userId, localDate, localDate, userId, userId]);
    for (const event of events) {
      const dayTimes = parseJson(event.day_times, {});
      const occurrenceTime = event.all_day === 1
        ? preferences.taskTime
        : (dayTimes[localDate]?.startTime || (event.date === localDate ? event.start_time : preferences.taskTime));
      const scheduledMinute = event.all_day === 1
        ? minutes(occurrenceTime)
        : Math.max(0, minutes(occurrenceTime) - preferences.eventMinutesBefore);
      if (currentMinute < scheduledMinute) continue;
      const scheduledTime = `${String(Math.floor(scheduledMinute / 60)).padStart(2, '0')}:${String(scheduledMinute % 60).padStart(2, '0')}`;
      const scheduledFor = `${localDate}T${scheduledTime}:00`;
      const key = deliveryKey('event', event.id, localDate, scheduledFor);
      if (delivered.has(key)) continue;
      notifications.push({
        key,
        type: 'event',
        sourceId: event.id,
        occurrenceDate: localDate,
        scheduledFor,
        title: event.all_day === 1 ? 'Evento para hoje' : `Evento às ${occurrenceTime}`,
        body: `${event.title} · ${event.calendar_name}`,
        url: `/calendario/day/${localDate}?evento=${encodeURIComponent(event.id)}`,
      });
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (device_id, delivery_key) DO NOTHING`,
        [id('ndl'), device.id, device.user_id, entry.key, entry.type, entry.sourceId,
          entry.occurrenceDate, entry.scheduledFor, now]);
    }
    await tx.run("DELETE FROM notification_deliveries WHERE delivered_at::timestamptz < CURRENT_TIMESTAMP - INTERVAL '90 days'");
  });
  res.json({ success: true, delivered: valid.length });
}));

module.exports = { router, deviceRouter, authenticateDevice, deliveryKey };
