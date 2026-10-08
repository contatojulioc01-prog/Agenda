const test = require('node:test');
const assert = require('node:assert/strict');

const { getAiToolCatalog, shouldPlanWithAgendaTools } = require('../mcp/agenda-tools');

test('publica o catálogo completo de ferramentas MCP com JSON Schema', () => {
  const tools = getAiToolCatalog();
  const names = tools.map(tool => tool.name);

  assert.equal(tools.length, 23);
  assert.ok(names.includes('obter_contexto'));
  assert.ok(names.includes('listar_agendas'));
  assert.ok(names.includes('listar_eventos'));
  assert.ok(names.includes('obter_evento'));
  assert.ok(names.includes('listar_quadros'));
  assert.ok(names.includes('listar_colunas'));
  assert.ok(names.includes('listar_tarefas'));
  assert.ok(names.includes('obter_tarefa'));
  assert.ok(names.includes('obter_contexto_completo'));
  assert.ok(names.includes('listar_anexos'));
  assert.ok(names.includes('obter_configuracao_notificacoes'));
  assert.ok(names.includes('exportar_meus_dados'));
  assert.equal(tools.every(tool => tool.parameters?.type === 'object'), true);
  assert.equal(tools.every(tool => typeof tool.readOnly === 'boolean'), true);
  assert.equal(tools.every(tool => tool.readOnly === true), true);
  assert.equal(tools.every(tool => tool.destructive === false), true);
});

test('aciona o planejador MCP apenas para conversas relacionadas à agenda', () => {
  assert.equal(shouldPlanWithAgendaTools('Quais tarefas vencem amanhã?'), true);
  assert.equal(shouldPlanWithAgendaTools('Crie uma reunião hoje às 15h'), true);
  assert.equal(shouldPlanWithAgendaTools('O que tenho a fazer na equipe Garotos de Programa?'), true);
  assert.equal(shouldPlanWithAgendaTools('Mostre os cards do time Garotos de Programa'), true);
  assert.equal(shouldPlanWithAgendaTools('Explique o que é fotossíntese'), false);
});
