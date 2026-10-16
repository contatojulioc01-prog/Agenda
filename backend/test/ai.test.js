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
      assert.equal(forwardedBody.model, 'gemini-3.5-flash-lite');
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

test('encaminha perguntas de tarefas e equipe para a LLM sem respostas prontas interceptadas', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SSO_LLM_API_KEY;
  process.env.SSO_LLM_API_KEY = 'test-secret';
  let llmCalls = 0;
  global.fetch = async (url, options) => {
    llmCalls++;
    const isStream = Boolean(JSON.parse(options.body).stream);
    if (!isStream) {
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"answer"}' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('data: {"choices":[{"delta":{"content":"Análise da LLM: suas tarefas estão em dia."}}]}\n\ndata: [DONE]\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  try {
    await withServer(async baseUrl => {
      const response = await originalFetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-qa' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'O que eu tenho a fazer na equipe?' }],
        }),
      });
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.match(text, /Análise da LLM: suas tarefas estão em dia\./);
      assert.ok(llmCalls >= 1, 'Deveria ter chamado o provedor LLM');
    });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SSO_LLM_API_KEY; else process.env.SSO_LLM_API_KEY = originalKey;
  }
});

test('retorna eventos de pagamento e feriados na listagem de eventos sem perguntar agenda', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SSO_LLM_API_KEY;
  process.env.SSO_LLM_API_KEY = 'test-secret';
  let llmCalls = 0;
  global.fetch = async (url, options) => {
    llmCalls++;
    const isStream = Boolean(JSON.parse(options.body).stream);
    if (!isStream) {
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"call","tool":"listar_eventos","arguments":{"busca":"pagamento"}}' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('data: {"choices":[{"delta":{"content":"O pagamento cai no 5º dia útil."}}]}\n\ndata: [DONE]\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  try {
    await withServer(async baseUrl => {
      const response = await originalFetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-qa' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Quais são as datas de pagamento e adiantamento salarial?' }],
        }),
      });
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.match(text, /O pagamento cai no 5º dia útil./);
      assert.ok(llmCalls >= 1);
    });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SSO_LLM_API_KEY; else process.env.SSO_LLM_API_KEY = originalKey;
  }
});

test('interpreta chamadas MCP simplificadas do Groq/Llama em formato texto/pseudocódigo (get_tasks)', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SSO_LLM_API_KEY;
  process.env.SSO_LLM_API_KEY = 'test-secret';
  let passedContext = '';
  global.fetch = async (url, options) => {
    const parsedBody = JSON.parse(options.body);
    const isStream = Boolean(parsedBody.stream);
    if (!isStream) {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: '```mcp\nget_tasks\nteam="LinkedIn"\nkeyword="Revisão Final"\n```',
          },
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    passedContext = parsedBody.systemInstruction || '';
    return new Response('data: {"choices":[{"delta":{"content":"Tarefas encontradas com sucesso."}}]}\n\ndata: [DONE]\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  try {
    await withServer(async baseUrl => {
      const response = await originalFetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-qa' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'verifique e me informe referente a Revisão Final do time linkedin' }],
        }),
      });
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.match(text, /Tarefas encontradas com sucesso\./);
      assert.match(passedContext, /listar_tarefas/);
    });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SSO_LLM_API_KEY; else process.env.SSO_LLM_API_KEY = originalKey;
  }
});

test('suprime bloco proibido de botões de interface e ações disponíveis no streaming do chat', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SSO_LLM_API_KEY;
  process.env.SSO_LLM_API_KEY = 'test-secret';

  const simulatedChunks = [
    'Com base nos registros da Agenda Corporativa Doce Brinquedo, há uma reunião agendada para 30/10/2026.\n\n',
    'Evento: 📋 Reunião com a Michelli\nData: 30/10/2026\nPauta/Descrição: Prazo da tarefa Kanban. Pauta para reunião com Michelli.\n\n',
    '"Ações e Informações Disponíveis\nPara gerenciar este compromisso ou o card associado diretamente na interface da plataforma, você pode utilizar as seguintes opções do menu contextual:\n\n',
    '👁️ Visualizar — abre a modal em modo de visualização.\n✏️ Editar — abre a modal em modo de edição.\n📌 Fixar / Desafixar.\n🗑️ Excluir.\n\n',
    'Caso precise realizar alguma alteração no evento, como ajustar o horário, atualizar a descrição com novos tópicos da pauta ou gerenciar o card no quadro Kanban correspondente, acesse diretamente a sua interface da Agenda Corporativa Doce Brinquedo para aplicar as modificações desejadas."',
  ];

  global.fetch = async (url, options) => {
    const isStream = Boolean(JSON.parse(options.body).stream);
    if (!isStream) {
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"answer"}' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sseBody = simulatedChunks
      .map(chunk => `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`)
      .join('') + 'data: [DONE]\n\n';

    return new Response(sseBody, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  try {
    await withServer(async baseUrl => {
      const response = await originalFetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-qa' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'como posso prosseguir com a reunião com a michelli?' }],
        }),
      });
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.match(text, /Reunião com a Michelli/);
      assert.doesNotMatch(text, /Ações e Informações Disponíveis/);
      assert.doesNotMatch(text, /Visualizar — abre a modal/);
      assert.doesNotMatch(text, /menu contextual/);
      assert.doesNotMatch(text, /modificações desejadas/);
    });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SSO_LLM_API_KEY; else process.env.SSO_LLM_API_KEY = originalKey;
  }
});

test('instrui a IA a ajudar a pensar, opinar sobre a descrição e propor pauta/condução ao ser perguntado como prosseguir', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SSO_LLM_API_KEY;
  process.env.SSO_LLM_API_KEY = 'test-secret';
  let capturedSystemInstruction = '';

  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const isStream = Boolean(body.stream);
    if (!isStream) {
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"answer"}' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    capturedSystemInstruction = body.systemInstruction || '';
    return new Response('data: {"choices":[{"delta":{"content":"Sugestão de pauta para reunião..."}}]}\n\ndata: [DONE]\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  try {
    await withServer(async baseUrl => {
      const response = await originalFetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-qa' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'como posso prosseguir com a reunião com a michelli?' }],
        }),
      });
      assert.equal(response.status, 200);
      assert.match(capturedSystemInstruction, /AJUDE A PENSAR E OPINE SOBRE/);
      assert.match(capturedSystemInstruction, /É EXPRESSAMENTE PROIBIDO incluir a seção "Ações e Informações Disponíveis"/);
      assert.match(capturedSystemInstruction, /VERIFIQUE A DESCRIÇÃO E PAUTA/);
    });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SSO_LLM_API_KEY; else process.env.SSO_LLM_API_KEY = originalKey;
  }
});

test('instrui a IA sobre permissão estrita exclusivamente de visualização (sem permissão de criação, alteração ou exclusão)', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SSO_LLM_API_KEY;
  process.env.SSO_LLM_API_KEY = 'test-secret';
  let capturedSystemInstruction = '';

  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const isStream = Boolean(body.stream);
    if (!isStream) {
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"answer"}' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    capturedSystemInstruction = body.systemInstruction || '';
    return new Response('data: {"choices":[{"delta":{"content":"Possuo apenas permissão de visualização..."}}]}\n\ndata: [DONE]\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  try {
    await withServer(async baseUrl => {
      const response = await originalFetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-qa' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Crie uma reunião para mim hoje às 15h ou altere meu evento' }],
        }),
      });
      assert.equal(response.status, 200);
      assert.match(capturedSystemInstruction, /SOMENTE VISUALIZAÇÃO E CONSULTA/i);
      assert.match(capturedSystemInstruction, /NÃO POSSUI permissão para criar, alterar, editar ou deletar\/excluir/i);
      assert.match(capturedSystemInstruction, /permissão exclusivamente de visualização e consulta/i);
    });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SSO_LLM_API_KEY; else process.env.SSO_LLM_API_KEY = originalKey;
  }
});

