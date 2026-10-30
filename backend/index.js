const fs = require('fs');
const path = require('path');

const explicitPgDatabase = process.env.PGDATABASE;
const explicitNodeEnv = process.env.NODE_ENV;

const dotenv = require('dotenv');
const envPaths = [path.join(__dirname, '..', '.env'), path.join(__dirname, '.env')];
const explicitPgDatabase = process.env.PGDATABASE;
const explicitNodeEnv = process.env.NODE_ENV;
const explicitPort = process.env.PORT;
const explicitHost = process.env.HOST;

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: true, quiet: true }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPort) {
  process.env.PORT = explicitPort;
}
if (explicitHost) {
  process.env.HOST = explicitHost;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

const express = require('express');
const http = require('http');
const { WebSocketServer }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDb, closeDb }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} = require('./db');
const { authenticateSocket }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} = require('./realtime-auth');

const PORT = process.env.PORT || 9900;
const HOST = process.env.HOST || '0.0.0.0';
const APP_VERSION = 'v5.1-mural-r2';
const DEV_AUTH_REQUESTED = process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_BYPASS === 'true';
const DEV_AUTH_ENABLED = DEV_AUTH_REQUESTED && ['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(HOST);
const DEV_AUTH_TOKEN = process.env.DEV_AUTH_TOKEN || 'agenda-dev-local';
const DEV_USER = {
  id: 'dev-local-user',
  name: 'Usuário de Desenvolvimento',
  email: 'dev@agenda.local',
  avatar: '',
  isActive: true,
  departamentId: 'dev-local',
  departamentName: 'Desenvolvimento',
  departament: { id: 'dev-local', name: 'Desenvolvimento' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
},
  roles: ['admin'],
  permissions: ['*'],
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
};

if (DEV_AUTH_REQUESTED && !DEV_AUTH_ENABLED) {
  console.warn('[DEV AUTH] Bypass recusado: use HOST=127.0.0.1 para habilitá-lo.');
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

function isDevToken(token) {
  if (!DEV_AUTH_ENABLED || !token) return false;
  return String(token).replace(/^Bearer\s+/i, '').trim() === DEV_AUTH_TOKEN;
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

const app = express();
const server = http.createServer(app);
const realtimeClients = new Set();
let realtimeSequence = 0;
let shuttingDown = false;
let closeMcp = async () => {}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
};
let routesReady = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[SHUTDOWN] Encerrando com ${signal}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}...`);
  realtimeClients.forEach(response => response.end());
  wss.clients.forEach(client => client.close(1001, 'Servidor reiniciando'));
  await new Promise(resolve => server.close(resolve));
  await closeMcp();
  await closeDb();
  process.exit(0);
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

// ── WebSocket ────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

function broadcast(data) {
  const message = { ...data, messageId: `${Date.now()}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}-${++realtimeSequence}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}` }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
};
  const payload = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === 1 && client.userId) client.send(payload);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  realtimeClients.forEach(response => {
    try { response.write(`data: ${payload}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}\n\n`); }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
    catch { realtimeClients.delete(response); }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

wss.on('connection', async (ws, req) => {
  const ip = req.socket.remoteAddress;
  if (!(await authenticateSocket(ws, req, validateUserToken))) return;

  console.log(`[WS] +1 cliente (${ip}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}) | Total: ${wss.clients.size}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}`);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  const ping = setInterval(() => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    if (ws.readyState === 1) ws.ping();
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}, 25000);
  ws.on('close', () => {
    clearInterval(ping);
    console.log(`[WS] -1 cliente | Total: ${wss.clients.size}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}`);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  ws.on('error', err => console.error('[WS] Erro:', err.message));
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

// ── Middlewares ──────────────────────────────────────────────────────────────

// Helmet: headers de segurança configurados para compatibilidade com Angular e proxies internos
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
},
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
},
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}));
app.disable('x-powered-by');

// CORS: validação de origens seguras e rede interna
const rawOrigins = process.env.CORS_ORIGINS || '';
const allowedOrigins = rawOrigins
  ? rawOrigins.split(',').map(o => o.trim()).filter(Boolean)
  : [];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.length === 0 || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (host.endsWith('.local') || host === 'docebrinquedo.local') return true;
    if (/^192\.168\.\d+\.\d+$/.test(host) || /^10\.\d+\.\d+\.\d+$/.test(host) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch {}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
  return false;
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
    return callback(null, false);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
},
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-device-key', 'x-file-name', 'x-file-type', 'MCP-Protocol-Version', 'Mcp-Session-Id', 'Last-Event-ID'],
  exposedHeaders: ['MCP-Protocol-Version', 'Mcp-Session-Id'],
  credentials: true,
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}));

// Rate limiting global — 300 req/min por IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em instantes.' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
},
  skip: (req) => req.path === '/health' || !req.path.startsWith('/api'), // static files e health não limitados
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
app.use(globalLimiter);

// Rate limiting para proxy externo
const proxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de consultas externas atingido. Tente em 1 minuto.' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
},
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

// Aceita tanto o acesso direto http://servidor:9900/agenda quanto o proxy IIS,
// que remove /agenda antes de encaminhar a requisicao para o Node.
app.use((req, _res, next) => {
  const prefix = '/agenda';
  if (req.url === prefix || req.url.startsWith(`${prefix}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}/`) || req.url.startsWith(`${prefix}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}?`)) {
    const strippedUrl = req.url.slice(prefix.length);
    req.url = !strippedUrl ? '/' : (strippedUrl.startsWith('?') ? `/${strippedUrl}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}` : strippedUrl);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
  next();
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
app.use(express.json());
app.use((req, _res, next) => { req.broadcast = broadcast; next(); }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

// Garante UTF-8 em todas as respostas JSON da API
app.use('/api', (_req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

// Proxy transparente para a API corporativa (SSO Portal Doce Brinquedo)
const PORTAL_API = process.env.PORTAL_API || 'http://192.168.13.244:7000';
const SSO_API_KEY = process.env.SSO_API_KEY || process.env.PORTAL_API_KEY || '';
const authCache = new Map();

async function fetchWithTimeout(url, options = {}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} finally {
    clearTimeout(timer);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

function extractAuthenticatedUserId(payload) {
  const value = payload?.data?.user || payload?.data || payload?.user || payload;
  return value?.id ? String(value.id) : '';
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

async function validateSsoTicketWithPortal(ticket) {
  if (!ticket) return null;
  const cleanTicket = String(ticket).replace(/^Bearer\s+/i, '').trim();
  if (!cleanTicket) return null;

  const headers = { 'Content-Type': 'application/json' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
};
  if (SSO_API_KEY) {
    headers['X-Api-Key'] = SSO_API_KEY;
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

  try {
    const response = await fetchWithTimeout(`${PORTAL_API}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}/api/apikey/validate-token`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ token: cleanTicket }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
})
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

    if (response.ok) {
      const payload = await response.json();
      if (payload && (payload.success === true || payload.data)) {
        return payload;
      }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch (error) {
    console.error('[SSO] Erro ao validar ticket via apikey/validate-token:', error.message);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
  return null;
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

async function validateUserToken(token) {
  if (!token) return null;
  const cleanToken = String(token).replace(/^Bearer\s+/i, '').trim();
  if (!cleanToken) return null;
  if (isDevToken(cleanToken)) return DEV_USER.id;

  let cached = authCache.get(cleanToken);
  if (!cached || cached.expiresAt <= Date.now()) {
    try {
      // 1. Tenta validar via POST /api/apikey/validate-token
      const ssoValidation = await validateSsoTicketWithPortal(cleanToken);
      let authenticatedUserId = extractAuthenticatedUserId(ssoValidation);

      // 2. Se não retornou via validate-token, tenta /api/apikey/me ou /api/auth/me
      if (!authenticatedUserId) {
        const headers = { Authorization: `Bearer ${cleanToken}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}` }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
};
        if (SSO_API_KEY) headers['X-Api-Key'] = SSO_API_KEY;

        let response = null;
        if (SSO_API_KEY) {
          try {
            response = await fetchWithTimeout(`${PORTAL_API}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}/api/apikey/me`, { headers }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
          }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch {}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
        }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
        if (!response || !response.ok) {
          response = await fetchWithTimeout(`${PORTAL_API}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}/api/auth/me`, { headers: { Authorization: `Bearer ${cleanToken}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}` }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
        }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

        if (response && response.ok) {
          authenticatedUserId = extractAuthenticatedUserId(await response.json());
        }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
      }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

      if (!authenticatedUserId) return null;
      cached = { userId: authenticatedUserId, expiresAt: Date.now() + 300000 }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
};
      if (authCache.size >= 500) authCache.delete(authCache.keys().next().value);
      authCache.set(cleanToken, cached);
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch (error) {
      console.error('[AUTH] Falha ao validar sessão:', error.message);
      return null;
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
  return cached?.userId || null;
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

async function authenticateAgendaRequest(req, res, next) {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.replace(/^Bearer\s+/i, '').trim() || String(req.query.token || '').trim() || String(req.query.ticket || '').trim();
  if (!token) return res.status(401).json({ error: 'Autenticação obrigatória' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

  try {
    const authenticatedUserId = await validateUserToken(token);
    if (!authenticatedUserId) return res.status(401).json({ error: 'Sessão inválida ou expirada' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

    const requestedUserId = String(req.headers['x-user-id'] || '');
    if (requestedUserId && requestedUserId !== authenticatedUserId) return res.status(403).json({ error: 'Identidade da requisição não corresponde à sessão' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
    req.headers['x-user-id'] = authenticatedUserId;
    req.auth = {
      token: 'validated-by-agenda',
      clientId: authenticatedUserId,
      scopes: ['agenda:read', 'agenda:write'],
      extra: { userId: authenticatedUserId }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
},
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
};
    next();
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch (error) {
    console.error('[AUTH] Falha ao validar requisição:', error.message);
    res.status(503).json({ error: 'Serviço de autenticação indisponível' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

// ── Rotas ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: routesReady ? 'ok' : 'starting',
    version: APP_VERSION,
    routesReady,
    clients: Math.max(wss.clients.size, realtimeClients.size),
    transports: { websocket: wss.clients.size, eventStream: realtimeClients.size }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
},
    ts: new Date().toISOString(),
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

// Canal HTTP contínuo usado como redundância quando proxies não encaminham WebSocket.
app.get('/api/realtime', authenticateAgendaRequest, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(': connected\n\n');
  res.userId = req.headers['x-user-id'];
  realtimeClients.add(res);

  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 20000);
  req.on('close', () => {
    clearInterval(keepAlive);
    realtimeClients.delete(res);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

// Rota de login/validação do ticket SSO
app.post('/api/auth/sso-login', async (req, res) => {
  const ticket = req.body?.ticket || req.body?.token;
  if (!ticket) {
    return res.status(400).json({ error: 'Ticket de autenticação não fornecido' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

  if (isDevToken(ticket)) {
    return res.json({
      success: true,
      message: 'Sessão local de desenvolvimento iniciada',
      token: DEV_AUTH_TOKEN,
      data: DEV_USER,
      user: DEV_USER,
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

  try {
    const ssoResult = await validateSsoTicketWithPortal(ticket);
    if (ssoResult && (ssoResult.success || ssoResult.data)) {
      const userData = ssoResult.data || ssoResult;
      const userId = extractAuthenticatedUserId(ssoResult);
      if (userId) {
        authCache.set(ticket, { userId, expiresAt: Date.now() + 300000 }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
      }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
      return res.json({
        success: true,
        message: ssoResult.message || 'Token validado com sucesso',
        token: ticket,
        data: userData,
        user: userData
      }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

    // Fallback: tenta validar se o ticket fornecido for um token JWT direto
    const userId = await validateUserToken(ticket);
    if (userId) {
      return res.json({
        success: true,
        message: 'Token validado com sucesso',
        token: ticket,
        data: { id: userId }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
},
        user: { id: userId }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
      }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

    return res.status(401).json({ error: 'Ticket de autenticação inválido ou expirado' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch (error) {
    console.error('[SSO] Erro na validação sso-login:', error.message);
    return res.status(500).json({ error: 'Falha ao conectar com o SSO' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

const handleUsersProxy = async (req, res) => {
  if (isDevToken(req.headers.authorization)) return res.json([DEV_USER]);
  try {
    const authHeader = req.headers['authorization'] || '';
    const headers = {}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
};
    if (authHeader) headers['Authorization'] = authHeader;
    if (SSO_API_KEY) headers['X-Api-Key'] = SSO_API_KEY;

    let response = null;

    // Tenta primeiro o endpoint de API Key (/api/apikey/users) se a chave existir
    if (SSO_API_KEY) {
      try {
        response = await fetchWithTimeout(`${PORTAL_API}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}/api/apikey/users`, { headers }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
      }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch (err) {
        console.warn('[PROXY] Falha ao consultar /api/apikey/users:', err.message);
      }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

    // Fallback para o endpoint legado /api/users/all
    if (!response || !response.ok) {
      response = await fetchWithTimeout(`${PORTAL_API}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}/api/users/all`, {
        headers: authHeader ? { 'Authorization': authHeader }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} : {}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
      }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

    if (!response.ok) {
      console.warn(`[PROXY] API corporativa retornou HTTP ${response.status}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} para usuários`);
      const text = await response.text();
      let errorBody = null;
      try { errorBody = JSON.parse(text); }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch { errorBody = { message: text || `HTTP ${response.status}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}` }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}; }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
      return res.status(response.status).json(errorBody);
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

    const data = await response.json();

    // Filtra estritamente usuários ativos (isActive: true)
    if (data && data.data && Array.isArray(data.data.userResponses)) {
      data.data.userResponses = data.data.userResponses.filter(u => u.isActive === true || u.isActive === 'true' || u.isActive === 1);
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} else if (data && data.data && Array.isArray(data.data.users)) {
      data.data.users = data.data.users.filter(u => u.isActive === true || u.isActive === 'true' || u.isActive === 1);
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} else if (data && Array.isArray(data.data)) {
      data.data = data.data.filter(u => u.isActive === true || u.isActive === 'true' || u.isActive === 1);
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} else if (Array.isArray(data)) {
      return res.json(data.filter(u => u.isActive === true || u.isActive === 'true' || u.isActive === 1));
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

    res.json(data);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch (err) {
    console.error('[PROXY] Erro ao buscar colaboradores da API corporativa:', err.message);
    res.status(502).json({ error: err.message, fallback: true }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
};

app.get('/api/users/all', authenticateAgendaRequest, proxyLimiter, handleUsersProxy);
app.get('/api/users', authenticateAgendaRequest, proxyLimiter, handleUsersProxy);

app.get('/api/auth/me', async (req, res) => {
  if (isDevToken(req.headers.authorization)) {
    return res.json({ success: true, data: DEV_USER, user: DEV_USER }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
  try {
    const authHeader = req.headers['authorization'] || '';
    const headers = {}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
};
    if (authHeader) headers['Authorization'] = authHeader;
    if (SSO_API_KEY) headers['X-Api-Key'] = SSO_API_KEY;

    let response = null;
    if (SSO_API_KEY && authHeader) {
      try {
        response = await fetchWithTimeout(`${PORTAL_API}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}/api/apikey/me`, { headers }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
      }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch {}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

    if (!response || !response.ok) {
      response = await fetchWithTimeout(`${PORTAL_API}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}/api/auth/me`, {
        headers: authHeader ? { 'Authorization': authHeader }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} : {}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
      }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

    if (!response.ok) {
      console.warn(`[PROXY] API corporativa retornou HTTP ${response.status}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} para /auth/me`);
      const text = await response.text();
      let errorBody = null;
      try { errorBody = JSON.parse(text); }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch { errorBody = { message: text || `HTTP ${response.status}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}` }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}; }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
      return res.status(response.status).json(errorBody);
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

    const data = await response.json();
    res.json(data);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch (err) {
    console.error('[PROXY] Erro ao buscar /auth/me da API corporativa:', err.message);
    res.status(502).json({ error: err.message, fallback: true }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});


// Validação estrita do parâmetro :year para prevenir SSRF
app.get('/api/holidays/:year', async (req, res) => {
  const year = parseInt(req.params.year, 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'Ano inválido. Informe um ano entre 2000 e 2100.' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
  try {
    const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}`);
    if (!response.ok) {
      return res.status(response.status).json({ error: `Erro HTTP ${response.status}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} na BrasilAPI` }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
    const data = await response.json();
    res.json(data);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch (err) {
    console.error('[PROXY] Erro ao buscar feriados:', err.message);
    res.status(502).json({ error: err.message, fallback: true }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

// Inicializar DB antes de registrar rotas que dependem dele
initDb().then(async () => {
  const calendarsRouter = require('./routes/calendars');
  const membersRouter   = require('./routes/members');
  const eventsRouter    = require('./routes/events');
  const kanbanRouter    = require('./routes/kanban');
  const muralRouter     = require('./routes/mural');
  const { router: attachmentsRouter, migrateAttachmentsToDisk }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} = require('./routes/attachments');
  const notifications = require('./routes/notifications');
  const privacyRouter = require('./routes/privacy');
  const aiRouter = require('./routes/ai');
  const { createAgendaMcpHttpHandler }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} = require('./mcp/http-handler');

  try {
    await migrateAttachmentsToDisk();
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch (error) {
    console.error('[ATTACHMENTS] Falha na migração automática de anexos para disco:', error);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

  try {
    await kanbanRouter.purgeExpiredTrash(broadcast);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch (error) {
    console.error('[LIXEIRA] Falha na limpeza inicial; uma nova tentativa será feita automaticamente:', error);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
  const trashCleanupTimer = setInterval(() => {
    kanbanRouter.purgeExpiredTrash(broadcast).catch(error => console.error('[LIXEIRA] Falha na limpeza automática:', error));
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}, 6 * 60 * 60 * 1000);
  trashCleanupTimer.unref();

  try {
    await kanbanRouter.autoArchiveColumnTasks(null, broadcast);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
} catch (error) {
    console.error('[KANBAN] Falha no auto-arquivamento inicial:', error);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}
  const autoArchiveTimer = setInterval(() => {
    kanbanRouter.autoArchiveColumnTasks(null, broadcast).catch(error => console.error('[KANBAN] Falha no auto-arquivamento periódico:', error));
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}, 60 * 1000);
  autoArchiveTimer.unref();

  app.use('/api/calendars', authenticateAgendaRequest, calendarsRouter);
  app.use('/api/calendars', authenticateAgendaRequest, membersRouter);  // /:id/members
  app.use('/api/calendars', authenticateAgendaRequest, eventsRouter);   // /:calendarId/events
  app.use('/api/events',    authenticateAgendaRequest, eventsRouter);   // /:id (edit/delete)
  app.use('/api/kanban',    authenticateAgendaRequest, kanbanRouter);
  app.use('/api/mural',     authenticateAgendaRequest, muralRouter);
  app.use('/api/attachments', authenticateAgendaRequest, attachmentsRouter);
  app.use('/api/notifications/device', notifications.deviceRouter);
  app.use('/api/notifications', authenticateAgendaRequest, notifications.router);
  app.use('/api/privacy', authenticateAgendaRequest, privacyRouter);
  app.use('/api/ai', authenticateAgendaRequest, aiRouter);
  routesReady = true;
  console.log('[ROUTES] Todos os roteadores registrados com sucesso.');

  const mcpHttp = await createAgendaMcpHttpHandler(broadcast);
  closeMcp = mcpHttp.close;
  const configuredMcpHosts = String(process.env.MCP_ALLOWED_HOSTS || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const isAllowedMcpHost = host => {
    const normalized = String(host || '').toLowerCase();
    if (configuredMcpHosts.length) return configuredMcpHosts.includes(normalized);
    return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' ||
      normalized === 'docebrinquedo.local' || normalized.endsWith('.local') ||
      /^10\.\d+\.\d+\.\d+$/.test(normalized) || /^192\.168\.\d+\.\d+$/.test(normalized) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(normalized);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
};
  app.all('/api/mcp', authenticateAgendaRequest, (req, res, next) => {
    if (!isAllowedMcpHost(req.hostname)) return res.status(403).json({ error: 'Host MCP não permitido' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
    if (!isAllowedOrigin(req.headers.origin)) return res.status(403).json({ error: 'Origem MCP não permitida' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
    return mcpHttp.middleware(req, res, next);
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

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
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
};
    // O IIS remove o prefixo publico /agenda antes de encaminhar a requisicao.
    // Portanto, os assets precisam estar disponiveis na raiz interna do Express.
    app.use(express.static(frontendPath, staticOptions));
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota nao encontrada' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}));

  if (frontendPath) {
    app.get('/{*splat}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(frontendPath, 'index.html'));
    }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}

  app.use((err, _req, res, next) => {
    console.error('[API]', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Erro interno no servidor' }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});

  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║       Agenda Corporativa — Backend v1.0         ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  REST → http://${HOST}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}:${PORT}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}/api`);
    console.log(`║  MCP  → http://${HOST}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}:${PORT}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}/api/mcp`);
    if (DEV_AUTH_ENABLED) console.log('║  DEV  → sessão local sem SSO ativa                ║');
    console.log(`║  WS   → ws://${HOST}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}:${PORT}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}`);
    if (frontendPath) console.log(`║  WEB  → ${frontendPath}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}`);
    console.log('╚══════════════════════════════════════════════════╝');
  }

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
}).catch(err => {
  console.error('[FATAL] Falha ao inicializar banco de dados ou registrar rotas:', err);
  process.exit(1);
}

if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}
if (explicitPgDatabase) {
  process.env.PGDATABASE = explicitPgDatabase;
} else if (process.env.NODE_ENV === 'development') {
  process.env.PGDATABASE = 'agenda_dev';
});
