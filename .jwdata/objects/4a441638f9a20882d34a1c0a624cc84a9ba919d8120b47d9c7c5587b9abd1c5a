const express = require('express');
const router = express.Router();
const db = require('../db');
const asyncRoute = require('../async-route');

const userId = req => String(req.headers['x-user-id'] || '');

/**
 * LGPD Art. 18, V — Direito à Portabilidade de Dados
 * Retorna todos os dados e metadados pertencentes ou associados ao titular em formato JSON estruturado.
 */
router.get('/export-my-data', asyncRoute(async (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'Identificador do titular não informado' });

  const [
    calendars,
    memberships,
    eventsCreated,
    boards,
    tasksCreated,
    tasksAssigned,
    notificationPrefs,
    devices
  ] = await Promise.all([
    db.all('SELECT id, name, color, is_private, is_default, created_at FROM calendars WHERE owner_id = $1', [uid]),
    db.all('SELECT calendar_id, permission FROM calendar_members WHERE user_id = $1', [uid]),
    db.all('SELECT id, calendar_id, title, description, date, end_date, start_time, end_time, color, category, all_day, created_at FROM events WHERE created_by = $1', [uid]),
    db.all('SELECT id, name, description, color, scope_type, team_id, created_at FROM kanban_boards WHERE owner_id = $1', [uid]),
    db.all('SELECT id, board_id, column_id, title, description, due_date, priority, labels, checklist, created_at FROM kanban_tasks WHERE created_by = $1', [uid]),
    db.all('SELECT id, board_id, column_id, title, description, due_date, priority FROM kanban_tasks WHERE assignee_id = $1 AND created_by != $2', [uid, uid]),
    db.all('SELECT enabled, task_enabled, event_enabled, task_time, event_minutes_before, updated_at FROM notification_preferences WHERE user_id = $1', [uid]),
    db.all('SELECT id, name, enabled, created_at, last_seen_at FROM notification_devices WHERE user_id = $1', [uid]),
  ]);

  const exportPayload = {
    metadata: {
      generatedAt: new Date().toISOString(),
      subjectId: uid,
      legalFramework: 'Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018 - Art. 18)',
      format: 'JSON / Structured Data',
    },
    profile: {
      userId: uid,
    },
    calendars: {
      owned: calendars,
      memberships,
    },
    events: eventsCreated,
    kanban: {
      boardsOwned: boards,
      tasksCreated,
      tasksAssigned,
    },
    notifications: {
      preferences: notificationPrefs[0] || null,
      registeredDevices: devices,
    },
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="meus-dados-lgpd-${uid}-${Date.now()}.json"`);
  res.json(exportPayload);
}));

/**
 * LGPD Art. 18, VI — Direito de Eliminação / Anonimização de Dados
 * Permite ao titular revogar dispositivos e anonimizar/expurgar dados desnecessários ou inativos.
 */
router.post('/anonymize-my-data', asyncRoute(async (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(400).json({ error: 'Identificador do titular não informado' });

  await db.transaction(async tx => {
    // 1. Revogar e excluir tokens e dispositivos
    await tx.run('DELETE FROM notification_devices WHERE user_id = $1', [uid]);
    await tx.run('DELETE FROM notification_preferences WHERE user_id = $1', [uid]);

    // 2. Limpar convites pendentes
    await tx.run('DELETE FROM calendar_invitations WHERE user_id = $1', [uid]);

    // 3. Anonimizar identificação em tarefas desvinculadas (se o usuário for desligado)
    await tx.run("UPDATE kanban_tasks SET assignee_id = NULL WHERE assignee_id = $1", [uid]);
  });

  res.json({
    success: true,
    message: 'Dispositivos revogados e dados associados anonimizados com sucesso.',
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;
