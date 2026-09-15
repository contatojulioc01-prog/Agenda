// Run against a production build using an isolated headless browser and mock API.
// node scripts/test-notification-links.cjs <path-to-playwright>
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('../backend/node_modules/express');
const { chromium } = require(process.argv[2] || 'playwright');

async function main() {
  const app = express();
  const output = path.resolve(__dirname, '../backend/public');
  app.use('/agenda', express.static(output));
  app.get('*', (_req, res) => res.sendFile(path.join(output, 'index.html')));
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  let browser;
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext();
    const profile = { id: 'user', name: 'Usuário de teste', email: 'test@example.com', isActive: true };
    const event = { id: 'event', calendarId: 'calendar', title: 'Reunião do teste', date: '2026-09-16', endDate: '2026-09-16', startTime: '09:00', endTime: '10:00', dayTimes: {}, allDay: false, color: 'indigo', category: 'Geral', description: '', attachments: [] };
    const task = { id: 'task', boardId: 'board', columnId: 'column', title: 'Entrega do teste', description: '', position: 0, priority: 'medium', dueDate: '2026-09-16', labels: [], assigneeIds: [], checklist: [], archived: false, parentTaskId: null, attachments: [] };
    const board = { id: 'board', name: 'Quadro de teste', scopeType: 'personal', owner_id: 'user', columns: [{ id: 'column', board_id: 'board', title: 'A fazer', color: '#64748b', position: 0 }], tasks: [task] };
    let saved;
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      const pathname = url.pathname.replace(/^\/agenda/, '');
      if (pathname === '/health') return route.fulfill({ json: { status: 'ok' } });
      if (!pathname.startsWith('/api/')) return route.continue();
      let body = [];
      if (pathname === '/api/auth/me') body = { data: profile };
      if (pathname === '/api/auth/sso-login') body = { success: true, token: 'test-session', user: profile };
      if (pathname === '/api/users/all') body = [profile];
      if (pathname === '/api/calendars') body = [{ id: 'calendar', name: 'Agenda de teste', owner_id: 'user', color: '#4f46e5', isDefault: true, members: [] }];
      if (pathname === '/api/calendars/calendar/events') body = [event];
      if (pathname === '/api/kanban/boards') body = [board];
      if (pathname === '/api/kanban/boards/board') body = board;
      if (pathname === '/api/notifications') body = { devices: [], preferences: { enabled: true, taskEnabled: true, eventEnabled: true, taskTime: '08:30', taskDaysBefore: 1, eventMinutesBefore: 15 } };
      if (pathname === '/api/notifications/preferences') { saved = route.request().postDataJSON(); body = saved; }
      if (pathname === '/api/realtime') return route.fulfill({ contentType: 'text/event-stream', body: ': connected\n\n' });
      return route.fulfill({ json: body });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const destination = '/agenda/calendario/dia/2026-09-16?agenda=calendar&evento=event';
    await page.goto(base + destination);
    await page.waitForURL('**/unauthorized?retorno=*');
    await page.locator('#manual-token').fill('test-session');
    await page.getByRole('button', { name: 'Acessar', exact: true }).click();
    await page.locator('app-event-modal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('app-event-modal input').first().inputValue(), event.title);
    assert.ok(page.url().includes('evento=event'));
    await page.reload();
    await page.locator('app-event-modal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('app-event-modal').count(), 1);
    await page.goto(base + '/agenda/tarefas/board?tarefa=task');
    await page.locator('.task-modal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.task-modal input').first().inputValue(), task.title);
    await page.locator('.task-modal .cancel-btn').click();
    await page.getByRole('button', { name: 'Configurar notificações', exact: true }).click();
    await page.locator('input[name="days"]').fill('3');
    await page.getByRole('button', { name: 'Salvar lembretes', exact: true }).click();
    await page.getByText('Preferências salvas.', { exact: true }).waitFor();
    assert.equal(saved.taskDaysBefore, 3);
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: login return, event deep link/reload, task deep link, notification preferences.');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
