const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const db = require('../db');
const asyncRoute = require('../async-route');

const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR || '\\\\192.168.13.244\\PrivateAppDataApplication\\AgendaAnexos';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PREVIEWABLE_IMAGE = /^image\/(?:png|jpe?g|gif|webp|bmp|avif)$/i;
const isPreviewable = mimeType => PREVIEWABLE_IMAGE.test(mimeType) || mimeType === 'application/pdf';
const userId = req => String(req.headers['x-user-id'] || '');
const attachmentDto = row => ({ id: row.id, fileName: row.file_name, mimeType: row.mime_type,
  byteSize: Number(row.byte_size), previewable: isPreviewable(row.mime_type), createdAt: row.created_at });

async function listAttachments(ownerType, ownerId, store = db) {
  const rows = await store.all(`SELECT id, file_name, mime_type, byte_size, created_at FROM attachments
    WHERE owner_type = $1 AND owner_id = $2 ORDER BY created_at, id`, [ownerType, ownerId]);
  return rows.map(attachmentDto);
}

async function ownerAccess(ownerType, ownerId, uid, write = false) {
  if (ownerType === 'event') {
    const event = await db.get('SELECT * FROM events WHERE id = $1', [ownerId]);
    if (!event || await db.get('SELECT 1 FROM kanban_task_events WHERE event_id = $1', [ownerId])) return false;
    const calendar = await db.get('SELECT * FROM calendars WHERE id = $1', [event.calendar_id]);
    if (!calendar) return false;
    if (calendar.owner_id === uid) return true;
    const member = await db.get('SELECT permission FROM calendar_members WHERE calendar_id = $1 AND user_id = $2', [calendar.id, uid]);
    return !!member && (!write || ['owner', 'editor'].includes(member.permission));
  }
  if (ownerType === 'task') {
    const task = await db.get('SELECT * FROM kanban_tasks WHERE id = $1', [ownerId]);
    const board = task && await db.get('SELECT * FROM kanban_boards WHERE id = $1', [task.board_id]);
    if (!board) return false;
    if (board.scope_type !== 'team') return board.owner_id === uid;
    const member = await db.get('SELECT role FROM kanban_team_members WHERE team_id = $1 AND user_id = $2', [board.team_id, uid]);
    return !!member && (!write || ['admin', 'member'].includes(member.role));
  }
  if (ownerType === 'mural_item') {
    const item = await db.get('SELECT * FROM mural_items WHERE id = $1', [ownerId]);
    const mural = item && await db.get('SELECT * FROM mural_boards WHERE id = $1', [item.mural_id]);
    if (!mural) return false;
    if (mural.scope_type !== 'team') return mural.owner_id === uid;
    const member = await db.get('SELECT role FROM kanban_team_members WHERE team_id = $1 AND user_id = $2', [mural.team_id, uid]);
    return !!member && (!write || ['admin', 'member'].includes(member.role));
  }
  return false;
}

function safeFileName(value) {
  let decoded = '';
  try { decoded = decodeURIComponent(String(value || '')); } catch {}
  return decoded.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\\/]/g, '_').trim().slice(0, 240);
}

router.get('/:attachmentId/content', asyncRoute(async (req, res) => {
  const item = await db.get('SELECT * FROM attachments WHERE id = $1', [req.params.attachmentId]);
  if (!item) return res.status(404).json({ error: 'Anexo não encontrado' });
  if (!(await ownerAccess(item.owner_type, item.owner_id, userId(req)))) return res.status(403).json({ error: 'Sem acesso ao anexo' });
  const inline = isPreviewable(item.mime_type);
  res.setHeader('Content-Type', item.mime_type || 'application/octet-stream');
  res.setHeader('Content-Length', String(item.byte_size));
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(item.file_name)}`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (item.file_path && fs.existsSync(item.file_path)) {
    return fs.createReadStream(item.file_path).pipe(res);
  }
  if (item.content) {
    return res.send(item.content);
  }
  return res.status(404).json({ error: 'Arquivo do anexo não encontrado no servidor' });
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
    FROM attachments WHERE owner_type = $1 AND owner_id = $2`, [ownerType, ownerId]);
  if (Number(usage.attachment_count) >= 15) return res.status(409).json({ error: 'Limite de 15 anexos atingido' });
  if (Number(usage.total_bytes) + req.body.length > 50 * 1024 * 1024) return res.status(413).json({ error: 'Limite total de 50 MB excedido' });

  const attachmentId = `att-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  let diskFilePath = null;
  try {
    if (!fs.existsSync(ATTACHMENTS_DIR)) {
      try { fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true }); } catch {}
    }
    const safeDiskName = `${attachmentId}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    diskFilePath = path.join(ATTACHMENTS_DIR, safeDiskName);
    await fs.promises.writeFile(diskFilePath, req.body);
  } catch (fsErr) {
    console.warn('[ATTACHMENTS] Aviso: gravação direta no disco:', fsErr.message);
  }

  await db.run(`INSERT INTO attachments (id, owner_type, owner_id, file_name, mime_type, byte_size, content, created_by, created_at, file_path)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [attachmentId, ownerType, ownerId, fileName, mimeType, req.body.length, req.body, userId(req), now, diskFilePath]);

  if (ownerType === 'mural_item') {
    const muralItem = await db.get('SELECT mural_id FROM mural_items WHERE id = $1', [ownerId]);
    if (muralItem) req.broadcast?.({ type: 'mural_updated', muralId: muralItem.mural_id, itemId: ownerId });
  } else if (ownerType === 'task') {
    const task = await db.get('SELECT board_id FROM kanban_tasks WHERE id = $1', [ownerId]);
    if (task) req.broadcast?.({ type: 'kanban_updated', boardId: task.board_id, taskId: ownerId });
  }

  res.status(201).json(attachmentDto(await db.get('SELECT * FROM attachments WHERE id = $1', [attachmentId])));
}));

router.delete('/:attachmentId', asyncRoute(async (req, res) => {
  const item = await db.get('SELECT * FROM attachments WHERE id = $1', [req.params.attachmentId]);
  if (!item) return res.status(404).json({ error: 'Anexo não encontrado' });
  if (!(await ownerAccess(item.owner_type, item.owner_id, userId(req), true))) return res.status(403).json({ error: 'Sem permissão para excluir o anexo' });
  
  if (item.file_path && fs.existsSync(item.file_path)) {
    try {
      await fs.promises.unlink(item.file_path);
    } catch (fsErr) {
      console.warn('[ATTACHMENTS] Falha ao remover arquivo físico:', item.file_path, fsErr.message);
    }
  }
  
  await db.run('DELETE FROM attachments WHERE id = $1', [item.id]);

  if (item.owner_type === 'mural_item') {
    const muralItem = await db.get('SELECT mural_id FROM mural_items WHERE id = $1', [item.owner_id]);
    if (muralItem) req.broadcast?.({ type: 'mural_updated', muralId: muralItem.mural_id, itemId: item.owner_id });
  } else if (item.owner_type === 'task') {
    const task = await db.get('SELECT board_id FROM kanban_tasks WHERE id = $1', [item.owner_id]);
    if (task) req.broadcast?.({ type: 'kanban_updated', boardId: task.board_id, taskId: item.owner_id });
  }

  res.json({ success: true });
}));

router.use((error, _req, res, next) => error?.type === 'entity.too.large'
  ? res.status(413).json({ error: 'O arquivo excede o limite de 10 MB' }) : next(error));

module.exports = { router, listAttachments, ownerAccess };
