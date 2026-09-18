const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const aiRouter = require('../routes/ai');

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRouter);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('encaminha chat ao Doce LLM e converte o stream para o SSE público', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SSO_LLM_API_KEY;
  const originalBase = process.env.SSO_LLM_BASE_URL;
  const originalModel = process.env.AI_MODEL;
  process.env.SSO_LLM_API_KEY = 'test-secret';
  process.env.SSO_LLM_BASE_URL = 'http://gateway.local/api/v1';
  delete process.env.AI_MODEL;
  let forwardedBody;
  global.fetch = async (url, options) => {
    assert.equal(url, 'http://gateway.local/api/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    forwardedBody = JSON.parse(options.body);
    return new Response('data: {"choices":[{"delta":{"content":"Olá"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };

  try {
    await withServer(async baseUrl => {
      const response = await originalFetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'usuario-42' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Oi' }],
          sessionId: 'Agenda-User-identidade-forjada-session-987654321',
        }),
      });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /data: \{"delta":"Olá"\}/);
      assert.equal(forwardedBody.provider, 'GEMINI');
      assert.equal(forwardedBody.model, 'gemini-3.1-flash-lite');
      assert.equal(forwardedBody.stream, true);
      assert.equal(forwardedBody.store, true);
      assert.equal(forwardedBody.sessionId, 'Agenda-User-usuario-42-session-987654321');
    });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SSO_LLM_API_KEY; else process.env.SSO_LLM_API_KEY = originalKey;
    if (originalBase === undefined) delete process.env.SSO_LLM_BASE_URL; else process.env.SSO_LLM_BASE_URL = originalBase;
    if (originalModel === undefined) delete process.env.AI_MODEL; else process.env.AI_MODEL = originalModel;
  }
});

test('executa ação de texto e retorna somente o resultado', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SSO_LLM_API_KEY;
  process.env.SSO_LLM_API_KEY = 'test-secret';
  global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Texto revisado.' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    await withServer(async baseUrl => {
      const response = await originalFetch(`${baseUrl}/api/ai/text-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Texto.', action: 'review' }),
      });
      assert.deepEqual(await response.json(), { result: 'Texto revisado.' });
    });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SSO_LLM_API_KEY; else process.env.SSO_LLM_API_KEY = originalKey;
  }
});

test('converte erro enviado pelo gateway em erro SSE visível', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SSO_LLM_API_KEY;
  process.env.SSO_LLM_API_KEY = 'test-secret';
  global.fetch = async () => new Response('data: {"type":"error","error":"Falha do provedor"}\n\ndata: [DONE]\n\n', {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
  try {
    await withServer(async baseUrl => {
      const response = await originalFetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Olá' }] }),
      });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /"error":"A resposta da IA foi interrompida\."/);
    });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SSO_LLM_API_KEY; else process.env.SSO_LLM_API_KEY = originalKey;
  }
});
