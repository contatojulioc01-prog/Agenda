const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const {
  createAdminRouter,
  normalizeRoles,
  hasDevRole,
  requireDevRole,
} = require('../routes/admin');
const { LogBuffer } = require('../services/log-buffer');

function startTestServer(app) {
  return new Promise(resolve => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

test('normalizeRoles e hasDevRole suportam string[] e Array<{ id, name }>', () => {
  assert.deepEqual(normalizeRoles(['user', 'DEV']), ['user', 'DEV']);
  assert.deepEqual(normalizeRoles([{ id: '1', name: 'DEV' }, { id: '2', name: 'Admin' }]), ['DEV', 'Admin']);
  assert.equal(hasDevRole(['dev']), true);
  assert.equal(hasDevRole([{ id: '1', name: 'DEV' }]), true);
  assert.equal(hasDevRole(['admin', 'viewer']), false);
  assert.equal(hasDevRole([]), false);
});

test('requireDevRole bloqueia usuários sem role DEV com 403 e libera usuários com DEV', () => {
  let statusCode = 200;
  let body = null;
  let nextCalled = false;

  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
  };

  requireDevRole({ user: { id: 'u1', roles: ['admin'], isDev: false } }, res, () => { nextCalled = true; });
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
  assert.match(body.error, /DEV/);

  statusCode = 200;
  body = null;
  requireDevRole({ user: { id: 'u2', roles: ['DEV'], isDev: true } }, res, () => { nextCalled = true; });
  assert.equal(statusCode, 200);
  assert.equal(nextCalled, true);
});

test('rotas /api/admin protegem acesso, validam entrada e não expõem tokens crus', async () => {
  const authCache = new Map([
    ['super-secret-sso-token-12345', {
      userId: 'dev-1',
      name: 'Dev User',
      email: 'dev@empresa.local',
      roles: ['DEV'],
      isDev: true,
      expiresAt: Date.now() + 60000,
    }],
  ]);
  const logBuffer = new LogBuffer(10);
  logBuffer.push('warn', 'Aviso simulado de teste');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const roleHeader = String(req.headers['x-test-role'] || '');
    req.user = {
      id: 'test-user',
      name: 'Teste',
      roles: roleHeader ? [roleHeader] : [],
      isDev: roleHeader.toUpperCase() === 'DEV',
    };
    next();
  });
  app.use('/api/admin', requireDevRole, createAdminRouter({ authCache, logBuffer }));

  const { server, baseUrl } = await startTestServer(app);
  try {
    // 1. Sem role DEV -> 403
    const forbidden = await fetch(`${baseUrl}/api/admin/auth/cache`, { headers: { 'x-test-role': 'admin' } });
    assert.equal(forbidden.status, 403);

    // 2. Com role DEV -> 200 e token mascarado
    const cacheRes = await fetch(`${baseUrl}/api/admin/auth/cache`, { headers: { 'x-test-role': 'DEV' } });
    assert.equal(cacheRes.status, 200);
    const cacheJson = await cacheRes.json();
    assert.equal(cacheJson.total, 1);
    assert.equal(cacheJson.entries[0].userId, 'dev-1');
    assert.equal(JSON.stringify(cacheJson).includes('super-secret-sso-token-12345'), false);

    // 3. Validação de resourceType inválido na transferência de propriedade -> 400
    const badTransfer = await fetch(`${baseUrl}/api/admin/ownership/transfer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-role': 'DEV' },
      body: JSON.stringify({ resourceType: 'invalid_type', resourceId: 'x', newOwnerId: 'y' }),
    });
    assert.equal(badTransfer.status, 400);

    // 4. Validação de mensagem vazia no broadcast -> 400
    const badBroadcast = await fetch(`${baseUrl}/api/admin/realtime/broadcast`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-role': 'DEV' },
      body: JSON.stringify({ message: '   ' }),
    });
    assert.equal(badBroadcast.status, 400);

    // 5. Logs recentes retornam entradas do LogBuffer
    const logsRes = await fetch(`${baseUrl}/api/admin/logs/recent?level=warn`, { headers: { 'x-test-role': 'DEV' } });
    assert.equal(logsRes.status, 200);
    const logsJson = await logsRes.json();
    assert.equal(logsJson.total, 1);
    assert.equal(logsJson.entries[0].message, 'Aviso simulado de teste');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
