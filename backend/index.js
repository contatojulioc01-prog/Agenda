const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { initDb } = require('./db');

const PORT = process.env.PORT || 9900;
const HOST = '0.0.0.0';

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
app.get('/api/users/all', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const response = await fetch('http://192.168.13.249:7000/api/users/all', {
      headers: authHeader ? { 'Authorization': authHeader } : {}
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('[PROXY] Erro ao buscar /users/all da API corporativa:', err.message);
    res.status(502).json({ error: err.message, fallback: true });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const response = await fetch('http://192.168.13.249:7000/api/auth/me', {
      headers: authHeader ? { 'Authorization': authHeader } : {}
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('[PROXY] Erro ao buscar /auth/me da API corporativa:', err.message);
    res.status(502).json({ error: err.message, fallback: true });
  }
});

// Inicializar DB antes de registrar rotas que dependem dele
initDb().then(() => {
  const calendarsRouter = require('./routes/calendars');
  const membersRouter   = require('./routes/members');
  const eventsRouter    = require('./routes/events');

  app.use('/api/calendars', calendarsRouter);
  app.use('/api/calendars', membersRouter);  // /:id/members
  app.use('/api/calendars', eventsRouter);   // /:calendarId/events
  app.use('/api/events',    eventsRouter);   // /:id (edit/delete)

  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║       Agenda Corporativa — Backend v1.0         ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  REST → http://0.0.0.0:${PORT}/api              ║`);
    console.log(`║  WS   → ws://0.0.0.0:${PORT}                   ║`);
    console.log('╚══════════════════════════════════════════════════╝');
  });
}).catch(err => {
  console.error('[FATAL] Falha ao inicializar banco de dados:', err);
  process.exit(1);
});
