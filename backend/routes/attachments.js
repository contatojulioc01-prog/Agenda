const express = require('express');
const router = express.Router();
const db = require('../db');
const asyncRoute = require('../async-route');

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PREVIEWABLE_IMAGE = /^image\/(?:png|jpe?g|gif|webp|bmp|avif)$/i;
const userId = req => String(req.headers['x-user-id'] || '');
const attachmentDto = row => ({ id: row.id, fileName: row.file_name, mimeType: row.mime_type,
  byteSize: Number(row.byte_size), previewable: PREVIEWABLE_IMAGE.test(row.mime_type), createdAt: row.created_at });

async function listAttachments(ownerType, ownerId, store = db) {
  const rows = await store.all(`SELECT id, file_name, mime_type, byte_size, created_at FROM attachments
    WHERE owner_type = ? AND owner_id = ? ORDER BY created_at, id`, [ownerType, ownerId]);
  return rows.map(attachmentDto);
}

async function ownerAccess(ownerType, ownerId, uid, write = false) {
  if (ownerType === 'event') {
    const event = await db.get('SELECT * FROM events WHERE id = ?', [ownerId]);
    if (!event || await db.get('SELECT 1 FROM kanban_task_events WHERE event_id = ?', [ownerId])) return false;
    const calendar = await db.get('SELECT * FROM calendars WHERE id = ?', [event.calendar_id]);
    if (!calendar) return false;
    if (calendar.owner_id === uid) return true;
    const member = await db.get('SELECT permission FROM calendar_members WHERE calendar_id = ? AND user_id = ?', [calendar.id, uid]);
    return !!member && (!write || ['owner', 'editor'].includes(member.permission));
  }
  if (ownerType === 'task') {
    const task = await db.get('SELECT * FROM kanban_tasks WHERE id = ?', [ownerId]);
    const board = task && await db.get('SELECT * FROM kanban_boards WHERE id = ?', [task.board_id]);
    if (!board) return false;
    if (board.scope_type !== 'team') return board.owner_id === uid;
    const member = await db.get('SELECT role FROM kanban_team_members WHERE team_id = ? AND user_id = ?', [board.team_id, uid]);
    return !!member && (!write || ['admin', 'member'].includes(member.role));
  }
  return false;
}

function safeFileName(value) {
  let decoded = '';
  try { decoded = decodeURIComponent(String(value || '')); } catch {}
  return decoded.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '_').trim().slice(0, 240);
}

router.get('/:attachmentId/content', asyncRoute(async (req, res) => {
  const item = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.attachmentId]);
  if (!item) return res.status(404).json({ error: 'Anexo não encontrado' });
  if (!(await ownerAccess(item.owner_type, item.owner_id, userId(req)))) return res.status(403).json({ error: 'Sem acesso ao anexo' });
  const inline = PREVIEWABLE_IMAGE.test(item.mime_type);
  res.setHeader('Content-Type', item.mime_type || 'application/octet-stream');
  res.setHeader('Content-Length', String(item.byte_size));
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(item.file_name)}`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(item.content);
}));

router.post('/:ownerType/:ownerId', express.raw({ type: 'application/octet-stream', limit: `${MAX_FILE_SIZE}b` }), asyncRoute(async (req, res) => {
  const { ownerType, ownerId } = req.params;
  if (!(await ownerAccess(ownerType, ownerId, userId(req), true))) return res.status(403).json({ error: 'Sem permissão para anexar arquivos' });
  const fileName = safeFileName(req.headers['x-file-name']);
  const requestedMimeType = String(req.headers['x-file-type'] || '').toLowerCase();
  const mimeType = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(requestedMimeType)
    ? requestedMimeType.slice(0, 150) : 'application/octet-stream';
  if (!fileName) return res.status(400).json({ error: 'Nome do arquivo não informado' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Arquivo vazio' });
  const usage = await db.get(`SELECT COUNT(*) attachment_count, COALESCE(SUM(byte_size), 0) total_bytes
    FROM attachments WHERE owner_type = ? AND owner_id = ?`, [ownerType, ownerId]);
  if (Number(usage.attachment_count) >= 10) return res.status(409).json({ error: 'Limite de 10 anexos atingido' });
  if (Number(usage.total_bytes) + req.body.length > 50 * 1024 * 1024) return res.status(413).json({ error: 'Limite total de 50 MB excedido' });
  const attachmentId = `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  await db.run(`INSERT INTO attachments (id, owner_type, owner_id, file_name, mime_type, byte_size, content, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [attachmentId, ownerType, ownerId, fileName, mimeType, req.body.length, req.body, userId(req), now]);
  res.status(201).json(attachmentDto(await db.get('SELECT * FROM attachments WHERE id = ?', [attachmentId])));
}));

router.delete('/:attachmentId', asyncRoute(async (req, res) => {
  const item = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.attachmentId]);
  if (!item) return res.status(404).json({ error: 'Anexo não encontrado' });
  if (!(await ownerAccess(item.owner_type, item.owner_id, userId(req), true))) return res.status(403).json({ error: 'Sem permissão para excluir o anexo' });
  await db.run('DELETE FROM attachments WHERE id = ?', [item.id]);
  res.json({ success: true });
}));

router.use((error, _req, res, next) => error?.type === 'entity.too.large'
  ? res.status(413).json({ error: 'O arquivo excede o limite de 10 MB' }) : next(error));

module.exports = { router, listAttachments };
