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
const { initDb } = require('./db');

const PORT = process.env.PORT || 9900;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
const server = http.createServer(app);

// ── WebSocket ────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(payload);
  });
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[WS] +1 cliente (${ip}) | Total: ${wss.clients.size}`);
  const ping = setInterval(() => { if (ws.readyState === 1) ws.ping(); }, 25000);
  ws.on('close', () => {
    clearInterval(ping);
    console.log(`[WS] -1 cliente | Total: ${wss.clients.size}`);
  });
  ws.on('error', err => console.error('[WS] Erro:', err.message));
});

// ── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','x-user-id'] }));
app.use(express.json());
app.use((req, _res, next) => { req.broadcast = broadcast; next(); });

// ── Rotas ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', clients: wss.clients.size, ts: new Date().toISOString() }));

// Proxy transparente para a API corporativa (elimina problemas de CORS e rede do browser)
const PORTAL_API = process.env.PORTAL_API || 'http://192.168.13.244:7000';

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
initDb().then(() => {
  const calendarsRouter = require('./routes/calendars');
  const membersRouter   = require('./routes/members');
  const eventsRouter    = require('./routes/events');
  const kanbanRouter    = require('./routes/kanban');

  app.use('/api/calendars', calendarsRouter);
  app.use('/api/calendars', membersRouter);  // /:id/members
  app.use('/api/calendars', eventsRouter);   // /:calendarId/events
  app.use('/api/events',    eventsRouter);   // /:id (edit/delete)
  app.use('/api/kanban',    kanbanRouter);

  // Em producao, o mesmo processo entrega Angular, API e WebSocket.
  const frontendCandidates = [
    process.env.FRONTEND_PATH
      ? path.resolve(__dirname, '..', process.env.FRONTEND_PATH)
      : null,
    path.join(__dirname, '..', 'frontend'),
    path.join(__dirname, '..', 'dist', 'agenda', 'browser'),
  ].filter(Boolean);
  const frontendPath = frontendCandidates.find(candidate =>
    fs.existsSync(path.join(candidate, 'index.html'))
  );

  if (frontendPath) {
    app.use(express.static(frontendPath, {
      index: false,
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    }));
  } else {
    console.warn('[WEB] Frontend compilado nao encontrado; somente API/WS estarao disponiveis.');
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
