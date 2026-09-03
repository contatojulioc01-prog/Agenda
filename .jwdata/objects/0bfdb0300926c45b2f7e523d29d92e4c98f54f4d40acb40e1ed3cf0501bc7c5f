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
  const loadedRouter = require(routerPath);
  app.use(loadedRouter.router || loadedRouter);
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

test('retorna a tarefa de origem nos eventos de prazo do Kanban', async () => {
  await withRouter('../routes/events', fakeDb => {
    fakeDb.get = async sql => sql.includes('FROM calendars')
      ? { id: 'calendar-team-1', owner_id: 'user-1' }
      : null;
    fakeDb.all = async () => [{
      id: 'event-1', calendar_id: 'calendar-team-1', title: 'Publicar', description: '',
      date: '2026-09-10', end_date: '2026-09-10', start_time: '00:00', end_time: '23:59',
      day_times: '{}', color: 'indigo', category: 'Tarefas', all_day: 1,
      is_task_deadline: 1, task_id: 'task-1', task_board_id: 'board-team-1', task_parent_id: 'task-parent-1',
    }];
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/calendar-team-1/events`, {
      headers: { 'x-user-id': 'user-1' },
    });
    assert.equal(response.status, 200);
    const [event] = await response.json();
    assert.equal(event.taskId, 'task-1');
    assert.equal(event.taskBoardId, 'board-team-1');
    assert.equal(event.taskParentId, 'task-parent-1');
    assert.equal(event.isTaskDeadline, true);
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

test('cria agenda compartilhada junto com o time', async () => {
  const statements = [];
  await withRouter('../routes/kanban', fakeDb => {
    const tx = {
      run: async (sql, params = []) => {
        statements.push({ sql, params });
        return { rowCount: 1 };
      },
      all: async sql => sql.includes('kanban_team_members')
        ? [{ user_id: 'user-1', role: 'admin' }]
        : [],
      get: async sql => {
        if (sql.includes('FROM calendars')) return { id: 'calendar-team-1' };
        if (sql.includes('FROM kanban_boards')) return { id: 'board-team-1' };
        return null;
      },
    };
    fakeDb.transaction = callback => callback(tx);
    fakeDb.get = async sql => sql.includes('FROM kanban_teams')
      ? { id: 'team-1', name: 'Produto', color: '#4f46e5', owner_id: 'user-1' }
      : null;
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/teams`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-1' },
      body: JSON.stringify({ name: 'Produto', color: '#4f46e5' }),
    });
    assert.equal(response.status, 201);
    assert.ok(statements.some(item => item.sql.includes('INSERT INTO calendars')));
    assert.ok(statements.some(item => item.sql.includes('UPDATE kanban_teams SET calendar_id')));
    assert.ok(statements.some(item => item.sql.includes('INSERT INTO calendar_members') && item.params.includes('user-1')));
  });
});

test('sincroniza prazo da tarefa na agenda compartilhada do time', async () => {
  const statements = [];
  const task = {
    id: 'task-1', board_id: 'board-team-1', column_id: 'column-1', title: 'Publicar', description: '',
    position: 0, priority: 'medium', due_date: '2026-09-10', labels: '[]', assignee_ids: '[]',
    checklist: '[]', archived: 0, created_by: 'user-1', created_at: '2026-09-01', updated_at: '2026-09-01',
    scope_type: 'team', team_id: 'team-1',
  };
  await withRouter('../routes/kanban', fakeDb => {
    fakeDb.get = async sql => {
      if (sql.includes('FROM kanban_boards')) return { id: 'board-team-1', owner_id: 'user-1', scope_type: 'team', team_id: 'team-1' };
      if (sql.includes('FROM kanban_team_members')) return { role: 'member' };
      if (sql.includes('FROM kanban_columns')) return { id: 'column-1', board_id: 'board-team-1' };
      if (sql.includes('COALESCE(MAX(position)')) return { next: 0 };
      if (sql.includes('SELECT kt.*, kb.scope_type')) return task;
      if (sql.includes('FROM kanban_tasks WHERE id')) return task;
      return null;
    };
    fakeDb.all = async sql => sql.includes('kanban_task_events') ? [] : [];
    fakeDb.run = async (sql, params = []) => {
      statements.push({ sql, params });
      return { rowCount: 1 };
    };
    fakeDb.transaction = callback => callback({
      get: async sql => {
        if (sql.includes('FROM kanban_teams')) return { id: 'team-1', name: 'Produto', color: '#4f46e5', owner_id: 'user-1', calendar_id: 'calendar-team-1' };
        if (sql.includes('FROM calendars')) return { id: 'calendar-team-1' };
        return null;
      },
      all: async sql => sql.includes('kanban_team_members') ? [{ user_id: 'user-1' }] : [],
      run: async (sql, params = []) => {
        statements.push({ sql, params });
        return { rowCount: 0 };
      },
    });
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/boards/board-team-1/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-1' },
      body: JSON.stringify({ title: 'Publicar', columnId: 'column-1', dueDate: '2026-09-10', assigneeIds: [], checklist: [], labels: [] }),
    });
    assert.equal(response.status, 201);
    assert.ok(statements.some(item => item.sql.includes('INSERT INTO events') && item.params.includes('calendar-team-1')));
    assert.ok(statements.some(item => item.sql.includes('INSERT INTO kanban_task_events') && item.params.includes('team:team-1')));
  });
});

test('impede editar ou excluir a agenda automatica de tarefas', async () => {
  let writes = 0;
  let transactions = 0;
  await withRouter('../routes/calendars', fakeDb => {
    fakeDb.get = async sql => {
      if (sql.includes('calendar_members')) return { permission: 'owner' };
      if (sql.includes('FROM calendars')) return { id: 'calendar-team-1', owner_id: 'user-1', is_task_calendar: 1, is_default: 0 };
      if (sql.includes('FROM kanban_teams')) return { id: 'team-1' };
      return null;
    };
    fakeDb.run = async () => { writes++; };
    fakeDb.transaction = async () => { transactions++; };
  }, async baseUrl => {
    const updateResponse = await fetch(`${baseUrl}/calendar-team-1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-1' },
      body: JSON.stringify({ name: 'Outro nome' }),
    });
    assert.equal(updateResponse.status, 409);

    const deleteResponse = await fetch(`${baseUrl}/calendar-team-1`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'user-1' },
    });
    assert.equal(deleteResponse.status, 409);
    assert.equal(writes, 0);
    assert.equal(transactions, 0);
  });
});

test('impede membro comum de excluir tarefa pelo endpoint', async () => {
  let readsAfterAuthorization = 0;
  let transactions = 0;
  await withRouter('../routes/kanban', fakeDb => {
    fakeDb.get = async sql => {
      if (sql.includes('FROM kanban_tasks WHERE id')) return { id: 'task-1', board_id: 'board-team-1', archived: 0 };
      if (sql.includes('FROM kanban_boards')) return { id: 'board-team-1', scope_type: 'team', team_id: 'team-1' };
      if (sql.includes('FROM kanban_team_members')) return { role: 'member' };
      return null;
    };
    fakeDb.all = async () => { readsAfterAuthorization++; return []; };
    fakeDb.transaction = async () => { transactions++; };
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/tasks/task-1`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'member-1' },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Somente administradores podem excluir tarefas' });
    assert.equal(readsAfterAuthorization, 0);
    assert.equal(transactions, 0);
  });
});

test('permite administrador excluir tarefa ativa', async () => {
  const statements = [];
  await withRouter('../routes/kanban', fakeDb => {
    fakeDb.get = async sql => {
      if (sql.includes('FROM kanban_tasks WHERE id')) return { id: 'task-1', board_id: 'board-team-1', archived: 0 };
      if (sql.includes('FROM kanban_boards')) return { id: 'board-team-1', scope_type: 'team', team_id: 'team-1' };
      if (sql.includes('FROM kanban_team_members')) return { role: 'admin' };
      return null;
    };
    fakeDb.all = async () => [];
    fakeDb.transaction = callback => callback({
      run: async (sql, params = []) => {
        statements.push({ sql, params });
        return { rowCount: 1 };
      },
    });
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/tasks/task-1`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'admin-1' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, deletedDescendants: 0 });
    assert.ok(statements.some(item => item.sql.includes('DELETE FROM kanban_tasks') && item.params.includes('task-1')));
  });
});

test('envia arquivo binário para uma tarefa acessível', async () => {
  let inserted = null;
  await withRouter('../routes/attachments', fakeDb => {
    fakeDb.all = async () => [];
    fakeDb.run = async (_sql, params) => { inserted = params; return { rowCount: 1 }; };
    fakeDb.get = async sql => {
      if (sql.includes('FROM kanban_tasks')) return { id: 'task-1', board_id: 'board-1' };
      if (sql.includes('FROM kanban_boards')) return { id: 'board-1', owner_id: 'user-1', scope_type: 'personal' };
      if (sql.includes('COUNT(*)')) return { attachment_count: 0, total_bytes: 0 };
      if (sql.includes('FROM attachments')) return {
        id: inserted[0], file_name: 'imagem.png', mime_type: 'image/png', byte_size: 4, created_at: inserted[8],
      };
      return null;
    };
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/task/task-1`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-user-id': 'user-1', 'x-file-name': 'imagem.png', 'x-file-type': 'image/png' },
      body: Buffer.from([1, 2, 3, 4]),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).previewable, true);
    assert.ok(Buffer.isBuffer(inserted[6]));
  });
});

test('protege e entrega imagem de anexo para pré-visualização', async () => {
  await withRouter('../routes/attachments', fakeDb => {
    fakeDb.all = async () => [];
    fakeDb.get = async sql => {
      if (sql.includes('FROM attachments')) return { id: 'att-1', owner_type: 'task', owner_id: 'task-1', file_name: 'foto.jpg', mime_type: 'image/jpeg', byte_size: 3, content: Buffer.from([7, 8, 9]) };
      if (sql.includes('FROM kanban_tasks')) return { id: 'task-1', board_id: 'board-1' };
      if (sql.includes('FROM kanban_boards')) return { id: 'board-1', owner_id: 'user-1', scope_type: 'personal' };
      return null;
    };
  }, async baseUrl => {
    const allowed = await fetch(`${baseUrl}/att-1/content`, { headers: { 'x-user-id': 'user-1' } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('content-type'), 'image/jpeg');
    assert.match(allowed.headers.get('content-disposition'), /^inline;/);
    assert.deepEqual([...new Uint8Array(await allowed.arrayBuffer())], [7, 8, 9]);
    const denied = await fetch(`${baseUrl}/att-1/content`, { headers: { 'x-user-id': 'other-user' } });
    assert.equal(denied.status, 403);
  });
});
