const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../db');

async function withRouter(routerPath, configureDb, run) {
  const originals = { get: db.get, all: db.all, run: db.run, transaction: db.transaction };
  configureDb(db);
  delete require.cache[require.resolve(routerPath)];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.broadcast = () => {}; next(); });
  app.use(require(routerPath));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
    Object.assign(db, originals);
    delete require.cache[require.resolve(routerPath)];
  }
}

test('não cria evento órfão quando a agenda não existe', async () => {
  let writes = 0;
  await withRouter('../routes/events', fakeDb => {
    fakeDb.get = async sql => sql.includes('FROM calendars') ? null : null;
    fakeDb.run = async () => { writes++; };
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/missing/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-1' },
      body: JSON.stringify({ title: 'Teste', date: '2026-08-24', endDate: '2026-08-24', startTime: '09:00', endTime: '10:00' }),
    });
    assert.equal(response.status, 403);
    assert.equal(writes, 0);
  });
});

test('rejeita reordenação para coluna de outro quadro', async () => {
  let transactions = 0;
  await withRouter('../routes/kanban', fakeDb => {
    fakeDb.get = async sql => sql.includes('kanban_boards')
      ? { id: 'board-1', owner_id: 'user-1', scope_type: 'personal' }
      : null;
    fakeDb.all = async sql => sql.includes('kanban_columns') ? [{ id: 'column-1' }] : [{ id: 'task-1' }];
    fakeDb.transaction = async () => { transactions++; };
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/boards/board-1/reorder`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-1' },
      body: JSON.stringify({ columns: [], tasks: [{ id: 'task-1', columnId: 'foreign-column', position: 0 }] }),
    });
    assert.equal(response.status, 400);
    assert.equal(transactions, 0);
  });
});
