const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../db');
const { deviceRouter, router, deliveryKey } = require('../routes/notifications');

async function scenario(options, run) {
  const originals = { get: db.get, all: db.all, run: db.run };
  const queries = [];
  db.get = async sql => sql.includes('notification_devices')
    ? (options.revoked ? null : { id: 'device', user_id: 'owner' })
    : { enabled: 1, task_enabled: 1, event_enabled: 1, task_time: '08:30', event_minutes_before: 15, task_days_before: 2, ...options.preferences };
  db.run = async () => ({ rowCount: 1 });
  db.all = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('notification_deliveries')) return (options.delivered || []).map(delivery_key => ({ delivery_key }));
    if (sql.includes('FROM kanban_tasks')) return options.tasks || [];
    if (sql.includes('FROM events')) return options.events || [];
    if (sql.includes('FROM kanban_boards')) return options.boards || [];
    if (sql.includes('FROM kanban_columns')) return options.columns || [];
    return [];
  };
  const app = express(); app.use(express.json()); app.use('/device', deviceRouter); app.use('/settings', router);
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  const request = (path, init = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { ...init, headers: { 'x-device-key': 'key', 'content-type': 'application/json', ...init.headers } });
  try { await run(request, queries); } finally { await new Promise(resolve => server.close(resolve)); Object.assign(db, originals); }
}

const event = { id: 'e', calendar_id: 'calendar', title: 'Reunião', calendar_name: 'Equipe', date: '2026-09-16', end_date: '2026-09-16', start_time: '00:05', end_time: '00:30', day_times: '{}', all_day: 0 };
const task = { id: 't', board_id: 'b', title: 'Entrega', board_name: 'Projeto', column_id: 'c', due_date: '2026-09-17', assignee_ids: '["owner"]', parent_task_id: 'parent' };

test('avisa antes da meia-noite e deduplica pela ocorrência do dia seguinte', async () => {
  await scenario({ events: [event], preferences: { task_enabled: 0 } }, async request => {
    let response = await request('/device/pending?date=2026-09-15&time=23:49');
    assert.equal((await response.json()).notifications.length, 0);
    response = await request('/device/pending?date=2026-09-15&time=23:50');
    const [notice] = (await response.json()).notifications;
    assert.equal(notice.occurrenceDate, '2026-09-16');
    assert.equal(notice.scheduledFor, '2026-09-15T23:50:00');
    assert.equal(notice.url, '/calendario/dia/2026-09-16?agenda=calendar&evento=e');
  });
  await scenario({ events: [event], delivered: [deliveryKey('event', 'e', '2026-09-16', '2026-09-15T23:50:00')] }, async request => {
    for (const moment of ['2026-09-15&time=23:59', '2026-09-16&time=00:00']) {
      assert.equal((await (await request('/device/pending?date=' + moment)).json()).notifications.length, 0);
    }
  });
});

test('avisa tarefas próximas no horário escolhido e conserva link de subtarefa', async () => {
  await scenario({ tasks: [task, { ...task, id: 'other', assignee_ids: '[]', assignee_id: 'someone-else' }] }, async (request, queries) => {
    assert.equal((await (await request('/device/pending?date=2026-09-15&time=08:29')).json()).notifications.length, 0);
    const notices = (await (await request('/device/pending?date=2026-09-15&time=08:30')).json()).notifications;
    assert.equal(notices.length, 1);
    assert.equal(notices[0].title, 'Tarefa com prazo próximo');
    assert.equal(notices[0].url, '/tarefas/b?tarefa=t&ramificacao=parent');
    const query = queries.find(item => item.sql.includes('FROM kanban_tasks'));
    assert.deepEqual(query.params, ['owner', '2026-09-15', '2026-09-17']);
    assert.ok(query.sql.includes('kt.archived = 0 AND kt.deleted_at IS NULL'));
  });
});

test('não envia eventos encerrados nem notificações desativadas', async () => {
  await scenario({ events: [event] }, async request => {
    assert.equal((await (await request('/device/pending?date=2026-09-16&time=01:00')).json()).notifications.length, 0);
  });
  await scenario({ tasks: [task], preferences: { enabled: 0 } }, async request => {
    assert.equal((await (await request('/device/pending?date=2026-09-15&time=09:00')).json()).notifications.length, 0);
  });
});

test('rejeita datas impossíveis e antecedência inválida', async () => {
  await scenario({}, async request => {
    assert.equal((await request('/device/pending?date=2026-02-30&time=09:00')).status, 400);
    assert.equal((await request('/settings/preferences', { method: 'PUT', body: JSON.stringify({ taskDaysBefore: 31 }) })).status, 400);
  });
});

test('chave revogada não acessa notificações nem Kanban', async () => {
  await scenario({ revoked: true }, async (request, queries) => {
    assert.equal((await request('/device/pending?date=2026-09-15&time=09:00')).status, 401);
    assert.equal((await request('/device/kanban')).status, 401);
    assert.equal(queries.length, 0);
  });
});

test('Kanban do dispositivo usa acesso pessoal ou associação ao time e links individuais', async () => {
  await scenario({ boards: [{ id: 'b', name: 'Projeto' }], columns: [{ id: 'c', title: 'Em andamento' }], tasks: [task] }, async (request, queries) => {
    const result = await (await request('/device/kanban')).json();
    assert.equal(result.boards[0].columns[0].tasks[0].url, '/tarefas/b?tarefa=t&ramificacao=parent');
    const access = queries.find(item => item.sql.includes('FROM kanban_boards'));
    assert.deepEqual(access.params, ['owner']);
    assert.ok(access.sql.includes("kb.scope_type = 'team' AND ktm.user_id = $1"));
    assert.ok(access.sql.includes("COALESCE(kb.scope_type, 'personal') <> 'team' AND kb.owner_id = $1"));
  });
});
