const fs = require('fs');
const path = require('path');

const dotenv = require('dotenv');
const envPaths = [path.join(__dirname, '..', '.env'), path.join(__dirname, '.env')];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false, quiet: true });
}
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { initDb, closeDb } = require('./db');

const PORT = process.env.PORT || 9900;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
const server = http.createServer(app);
const realtimeClients = new Set();
let realtimeSequence = 0;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[SHUTDOWN] Encerrando com ${signal}...`);
  realtimeClients.forEach(response => response.end());
  wss.clients.forEach(client => client.close(1001, 'Servidor reiniciando'));
  await new Promise(resolve => server.close(resolve));
  await closeDb();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

// ── WebSocket ────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

function broadcast(data) {
  const message = { ...data, messageId: `${Date.now()}-${++realtimeSequence}` };
  const payload = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(payload);
  });
  realtimeClients.forEach(response => {
    try { response.write(`data: ${payload}\n\n`); }
    catch { realtimeClients.delete(response); }
  });
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[WS] +1 cliente (${ip}) | Total: ${wss.clients.size}`);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const ping = setInterval(() => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    if (ws.readyState === 1) ws.ping();
  }, 25000);
  ws.on('close', () => {
    clearInterval(ping);
    console.log(`[WS] -1 cliente | Total: ${wss.clients.size}`);
  });
  ws.on('error', err => console.error('[WS] Erro:', err.message));
});

// ── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','x-user-id','x-file-name','x-file-type'] }));
// Aceita tanto o acesso direto http://servidor:9900/agenda quanto o proxy IIS,
// que remove /agenda antes de encaminhar a requisicao para o Node.
app.use((req, _res, next) => {
  const prefix = '/agenda';
  if (req.url === prefix || req.url.startsWith(`${prefix}/`) || req.url.startsWith(`${prefix}?`)) {
    const strippedUrl = req.url.slice(prefix.length);
    req.url = !strippedUrl ? '/' : (strippedUrl.startsWith('?') ? `/${strippedUrl}` : strippedUrl);
  }
  next();
});
app.use(express.json());
app.use((req, _res, next) => { req.broadcast = broadcast; next(); });

// ── Rotas ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  clients: Math.max(wss.clients.size, realtimeClients.size),
  transports: { websocket: wss.clients.size, eventStream: realtimeClients.size },
  ts: new Date().toISOString(),
}));

// Canal HTTP contínuo usado como redundância quando proxies não encaminham WebSocket.
app.get('/api/realtime', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(': connected\n\n');
  realtimeClients.add(res);

  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 20000);
  req.on('close', () => {
    clearInterval(keepAlive);
    realtimeClients.delete(res);
  });
});

// Proxy transparente para a API corporativa (elimina problemas de CORS e rede do browser)
const PORTAL_API = process.env.PORTAL_API || 'http://192.168.13.244:7000';
const authCache = new Map();

function extractAuthenticatedUserId(payload) {
  const value = payload?.data?.user || payload?.data || payload?.user || payload;
  return value?.id ? String(value.id) : '';
}

async function authenticateAgendaRequest(req, res, next) {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Autenticação obrigatória' });

  try {
    let cached = authCache.get(token);
    if (!cached || cached.expiresAt <= Date.now()) {
      const response = await fetch(`${PORTAL_API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return res.status(response.status === 403 ? 403 : 401).json({ error: 'Sessão inválida ou expirada' });
      const authenticatedUserId = extractAuthenticatedUserId(await response.json());
      if (!authenticatedUserId) return res.status(401).json({ error: 'Usuário autenticado não identificado' });
      cached = { userId: authenticatedUserId, expiresAt: Date.now() + 30000 };
      if (authCache.size >= 500) authCache.delete(authCache.keys().next().value);
      authCache.set(token, cached);
    }

    const requestedUserId = String(req.headers['x-user-id'] || '');
    if (requestedUserId && requestedUserId !== cached.userId) return res.status(403).json({ error: 'Identidade da requisição não corresponde à sessão' });
    req.headers['x-user-id'] = cached.userId;
    next();
  } catch (error) {
    console.error('[AUTH] Falha ao validar sessão:', error.message);
    res.status(503).json({ error: 'Serviço de autenticação indisponível' });
  }
}

const handleUsersProxy = async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const response = await fetch(`${PORTAL_API}/api/users/all`, {
      headers: authHeader ? { 'Authorization': authHeader } : {}
    });

    if (!response.ok) {
      console.warn(`[PROXY] API corporativa retornou HTTP ${response.status} para /users/all`);
      const text = await response.text();
      let errorBody = null;
      try { errorBody = JSON.parse(text); } catch { errorBody = { message: text || `HTTP ${response.status}` }; }
      return res.status(response.status).json(errorBody);
    }

    const data = await response.json();

    // Filtra estritamente usuários ativos (isActive: true)
    if (data && data.data && Array.isArray(data.data.userResponses)) {
      data.data.userResponses = data.data.userResponses.filter(u => u.isActive === true || u.isActive === 'true' || u.isActive === 1);
    } else if (data && data.data && Array.isArray(data.data.users)) {
      data.data.users = data.data.users.filter(u => u.isActive === true || u.isActive === 'true' || u.isActive === 1);
    } else if (data && Array.isArray(data.data)) {
      data.data = data.data.filter(u => u.isActive === true || u.isActive === 'true' || u.isActive === 1);
    } else if (Array.isArray(data)) {
      return res.json(data.filter(u => u.isActive === true || u.isActive === 'true' || u.isActive === 1));
    }

    res.json(data);
  } catch (err) {
    console.error('[PROXY] Erro ao buscar /users/all da API corporativa:', err.message);
    res.status(502).json({ error: err.message, fallback: true });
  }
};

app.get('/api/users/all', handleUsersProxy);
app.get('/api/users', handleUsersProxy);

app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const response = await fetch(`${PORTAL_API}/api/auth/me`, {
      headers: authHeader ? { 'Authorization': authHeader } : {}
    });

    if (!response.ok) {
      console.warn(`[PROXY] API corporativa retornou HTTP ${response.status} para /auth/me`);
      const text = await response.text();
      let errorBody = null;
      try { errorBody = JSON.parse(text); } catch { errorBody = { message: text || `HTTP ${response.status}` }; }
      return res.status(response.status).json(errorBody);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('[PROXY] Erro ao buscar /auth/me da API corporativa:', err.message);
    res.status(502).json({ error: err.message, fallback: true });
  }
});

app.get('/api/holidays/:year', async (req, res) => {
  try {
    const year = req.params.year;
    // O Node nativo >= 18 tem fetch global, caso seja antigo usaríamos node-fetch (mas assumimos que suporta fetch como nas rotas acima)
    const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
    if (!response.ok) {
      return res.status(response.status).json({ error: `Erro HTTP ${response.status} na BrasilAPI` });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('[PROXY] Erro ao buscar feriados:', err.message);
    res.status(502).json({ error: err.message, fallback: true });
  }
});

// Inicializar DB antes de registrar rotas que dependem dele
initDb().then(async () => {
  const calendarsRouter = require('./routes/calendars');
  const membersRouter   = require('./routes/members');
  const eventsRouter    = require('./routes/events');
  const kanbanRouter    = require('./routes/kanban');
  const attachmentsRouter = require('./routes/attachments').router;

  try {
    await kanbanRouter.purgeExpiredTrash(broadcast);
  } catch (error) {
    console.error('[LIXEIRA] Falha na limpeza inicial; uma nova tentativa será feita automaticamente:', error);
  }
  const trashCleanupTimer = setInterval(() => {
    kanbanRouter.purgeExpiredTrash(broadcast).catch(error => console.error('[LIXEIRA] Falha na limpeza automática:', error));
  }, 6 * 60 * 60 * 1000);
  trashCleanupTimer.unref();

  app.use('/api/calendars', authenticateAgendaRequest, calendarsRouter);
  app.use('/api/calendars', authenticateAgendaRequest, membersRouter);  // /:id/members
  app.use('/api/calendars', authenticateAgendaRequest, eventsRouter);   // /:calendarId/events
  app.use('/api/events',    authenticateAgendaRequest, eventsRouter);   // /:id (edit/delete)
  app.use('/api/kanban',    authenticateAgendaRequest, kanbanRouter);
  app.use('/api/attachments', authenticateAgendaRequest, attachmentsRouter);

  // Em producao, o mesmo processo entrega Angular, API e WebSocket.
  const frontendCandidates = [
    process.env.FRONTEND_PATH
      ? path.resolve(__dirname, '..', process.env.FRONTEND_PATH)
      : null,
    path.join(__dirname, 'public'),
  ].filter(Boolean);
  const frontendPath = frontendCandidates.find(candidate =>
    fs.existsSync(path.join(candidate, 'index.html'))
  );

  if (frontendPath) {
    const staticOptions = {
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    };
    // O IIS remove o prefixo publico /agenda antes de encaminhar a requisicao.
    // Portanto, os assets precisam estar disponiveis na raiz interna do Express.
    app.use(express.static(frontendPath, staticOptions));
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota nao encontrada' }));

  if (frontendPath) {
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }

  app.use((err, req, res, next) => {
    console.error('[API]', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  });

  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║       Agenda Corporativa — Backend v1.0         ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  REST → http://${HOST}:${PORT}/api`);
    console.log(`║  WS   → ws://${HOST}:${PORT}`);
    if (frontendPath) console.log(`║  WEB  → ${frontendPath}`);
    console.log('╚══════════════════════════════════════════════════╝');
  });
}).catch(err => {
  console.error('[FATAL] Falha ao inicializar banco de dados:', err);
  process.exit(1);
}).catch(error => {
  console.error('[DB] Não foi possível iniciar o PostgreSQL:', error.message);
  process.exitCode = 1;
});
