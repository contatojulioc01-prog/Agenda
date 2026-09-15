const test = require('node:test');
const assert = require('node:assert/strict');
const { authenticateSocket } = require('../realtime-auth');

function socket() { return { readyState: 1, close(code) { this.closedWith = code; } }; }

test('WebSocket rejeita conexão sem token ou com token inválido', async () => {
  for (const url of ['/', '/?token=invalid']) {
    const ws = socket();
    assert.equal(await authenticateSocket(ws, { headers: {}, url }, async () => ''), false);
    assert.equal(ws.closedWith, 4003);
    assert.equal(ws.userId, undefined);
  }
});

test('WebSocket somente libera identidade após validação', async () => {
  const ws = socket();
  assert.equal(await authenticateSocket(ws, { headers: { authorization: 'Bearer valid' }, url: '/' }, async token => {
    assert.equal(token, 'valid'); assert.equal(ws.userId, undefined); return 'owner';
  }), true);
  assert.equal(ws.userId, 'owner');
});

test('falha do SSO fecha WebSocket sem rejeição assíncrona não tratada', async () => {
  const ws = socket();
  assert.equal(await authenticateSocket(ws, { headers: {}, url: '/?token=valid' }, async () => { throw new Error('offline'); }), false);
  assert.equal(ws.closedWith, 1011);
});
