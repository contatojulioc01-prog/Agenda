const test = require('node:test');
const assert = require('node:assert/strict');

const { getAiToolCatalog, shouldPlanWithAgendaTools } = require('../mcp/agenda-tools');

test('publica o catálogo completo de ferramentas MCP com JSON Schema', () => {
  const tools = getAiToolCatalog();
  const names = tools.map(tool => tool.name);

  assert.equal(tools.length, 50);
  assert.ok(names.includes('obter_contexto'));
  assert.ok(names.includes('criar_evento'));
  assert.ok(names.includes('criar_tarefa'));
  assert.ok(names.includes('mover_tarefa_para_lixeira'));
  assert.ok(names.includes('obter_contexto_completo'));
  assert.ok(names.includes('criar_agenda'));
  assert.ok(names.includes('criar_equipe'));
  assert.ok(names.includes('obter_quadro'));
  assert.ok(names.includes('listar_anexos'));
  assert.ok(names.includes('obter_configuracao_notificacoes'));
  assert.ok(names.includes('exportar_meus_dados'));
  assert.equal(tools.every(tool => tool.parameters?.type === 'object'), true);
  assert.equal(tools.every(tool => typeof tool.readOnly === 'boolean'), true);
});

test('exige confirmação no schema das ferramentas destrutivas', () => {
  const destructive = getAiToolCatalog().filter(tool => tool.destructive);

  assert.deepEqual(destructive.map(tool => tool.name).sort(), [
    'excluir_agenda',
    'excluir_anexo',
    'excluir_coluna',
    'excluir_equipe',
    'excluir_evento',
    'excluir_quadro',
    'excluir_tarefa_permanentemente',
    'mover_tarefa_para_lixeira',
    'remover_membro_agenda',
    'remover_membro_equipe',
  ]);
  for (const tool of destructive) {
    assert.ok(tool.parameters.required.includes('confirmar'));
    assert.equal(tool.parameters.properties.confirmar.const, true);
  }
});

test('aciona o planejador MCP apenas para conversas relacionadas à agenda', () => {
  assert.equal(shouldPlanWithAgendaTools('Quais tarefas vencem amanhã?'), true);
  assert.equal(shouldPlanWithAgendaTools('Crie uma reunião hoje às 15h'), true);
  assert.equal(shouldPlanWithAgendaTools('O que tenho a fazer na equipe Garotos de Programa?'), true);
  assert.equal(shouldPlanWithAgendaTools('Mostre os cards do time Garotos de Programa'), true);
  assert.equal(shouldPlanWithAgendaTools('Explique o que é fotossíntese'), false);
});
