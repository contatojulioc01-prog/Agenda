const test = require('node:test');
const assert = require('node:assert/strict');
const { isIsoDate, isTime, validateEventInput, validateTaskInput } = require('../validation');

test('valida datas reais no formato ISO e horários de 24 horas', () => {
  assert.equal(isIsoDate('2026-02-28'), true);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('26-02-28'), false);
  assert.equal(isTime('23:59'), true);
  assert.equal(isTime('24:00'), false);
  assert.equal(isTime('9:00'), false);
});

test('rejeita eventos inconsistentes e aceita payload válido', () => {
  const valid = { title: 'Reunião', date: '2026-08-24', endDate: '2026-08-24', startTime: '09:00', endTime: '10:00', color: 'blue', allDay: false, dayTimes: {} };
  assert.equal(validateEventInput(valid), null);
  assert.match(validateEventInput({ ...valid, title: '   ' }), /Título/);
  assert.match(validateEventInput({ ...valid, endDate: '2026-08-23' }), /data final/i);
  assert.match(validateEventInput({ ...valid, color: 'javascript:red' }), /Cor/);
});

test('rejeita tarefas com prioridade, etiquetas ou checklist inválidos', () => {
  assert.equal(validateTaskInput({ title: 'Publicar', priority: 'high', labels: ['QA'], checklist: [{ id: '1', text: 'Revisar', done: false }], assigneeIds: [] }), null);
  assert.match(validateTaskInput({ title: 'Publicar', priority: 'invalid' }), /Prioridade/);
  assert.match(validateTaskInput({ title: 'Publicar', labels: Array(9).fill('x') }), /Etiquetas/);
  assert.match(validateTaskInput({ title: 'Publicar', checklist: [{ id: '1', text: '', done: false }] }), /Checklist/);
});
