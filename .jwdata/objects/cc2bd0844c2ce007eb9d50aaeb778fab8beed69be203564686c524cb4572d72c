/**
 * seed-dev.js — Popula o banco agenda_dev com dados fictícios para testes.
 * Uso: node scripts/seed-dev.js
 * (ou via npm: npm run seed:dev na raiz)
 */

// Garante que estamos no banco de desenvolvimento ANTES de carregar qualquer .env
process.env.PGDATABASE = 'agenda_dev';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Carrega .env sem sobrescrever PGDATABASE que já definimos acima
const envPaths = [path.join(__dirname, '..', '..', '.env'), path.join(__dirname, '..', '.env')];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false });
}

console.log('[SEED] Usando banco:', process.env.PGDATABASE);

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || '192.168.13.244',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'criancafeliz123',
});

const uid = () =>
  Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

// ────────────────────────────────────────────────────────────────────────────
// Dados fictícios
// ────────────────────────────────────────────────────────────────────────────

const USERS = [
  { id: 'user-dev-001', name: 'Ana Lima', email: 'ana.lima@empresa.local' },
  { id: 'user-dev-002', name: 'Bruno Costa', email: 'bruno.costa@empresa.local' },
  { id: 'user-dev-003', name: 'Carla Mendes', email: 'carla.mendes@empresa.local' },
  { id: 'dev-local-user', name: 'Usuário de Desenvolvimento', email: 'dev@agenda.local' },
];

const ME = USERS[3]; // usuário logado via DEV_AUTH_BYPASS

async function clearDev(client) {
  console.log('[SEED] Limpando dados de seed anteriores...');
  // Remove apenas dados criados por este seed (pelo prefixo de id ou owner)
  try { await client.query(`DELETE FROM mural_items WHERE created_by LIKE 'user-dev-%' OR created_by = $1`, [ME.id]); } catch {}
  try { await client.query(`DELETE FROM mural_groups WHERE mural_id IN (SELECT id FROM mural_boards WHERE owner_id LIKE 'user-dev-%' OR owner_id = $1)`, [ME.id]); } catch {}
  try { await client.query(`DELETE FROM mural_boards WHERE owner_id LIKE 'user-dev-%' OR owner_id = $1`, [ME.id]); } catch {}
  await client.query(`DELETE FROM kanban_tasks WHERE created_by LIKE 'user-dev-%' OR created_by = $1`, [ME.id]);
  await client.query(`DELETE FROM kanban_columns WHERE board_id IN (SELECT id FROM kanban_boards WHERE owner_id LIKE 'user-dev-%' OR owner_id = $1)`, [ME.id]);
  await client.query(`DELETE FROM kanban_team_members WHERE team_id IN (SELECT id FROM kanban_teams WHERE owner_id LIKE 'user-dev-%' OR owner_id = $1)`, [ME.id]);
  await client.query(`DELETE FROM kanban_boards WHERE owner_id LIKE 'user-dev-%' OR owner_id = $1`, [ME.id]);
  await client.query(`DELETE FROM kanban_teams WHERE owner_id LIKE 'user-dev-%' OR owner_id = $1`, [ME.id]);
  await client.query(`DELETE FROM events WHERE calendar_id IN (SELECT id FROM calendars WHERE owner_id LIKE 'user-dev-%' OR owner_id = $1)`, [ME.id]);
  await client.query(`DELETE FROM calendars WHERE owner_id LIKE 'user-dev-%' OR owner_id = $1`, [ME.id]);
}

async function seedCalendars(client) {
  console.log('[SEED] Criando agendas...');
  const now = new Date().toISOString();
  const cal1 = `cal-dev-${uid()}`;
  const cal2 = `cal-dev-${uid()}`;

  await client.query(
    `INSERT INTO calendars (id, name, color, owner_id, is_default, created_at)
     VALUES ($1,'Agenda Pessoal Dev','#6366f1',$2,1,$3)`,
    [cal1, ME.id, now]
  );
  await client.query(
    `INSERT INTO calendars (id, name, color, owner_id, is_default, created_at)
     VALUES ($1,'Projetos Dev','#10b981',$2,0,$3)`,
    [cal2, ME.id, now]
  );

  // Eventos
  const today = new Date();
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };

  const events = [
    { cal: cal1, title: 'Reunião de Alinhamento', date: fmt(addDays(today,1)), start: '09:00', end: '10:00', color: 'violet', category: 'Reunião', desc: 'Reunião semanal de alinhamento de equipe.' },
    { cal: cal1, title: 'Entrega do Relatório Mensal', date: fmt(addDays(today,3)), start: '17:00', end: '18:00', color: 'amber', category: 'Prazo', desc: 'Prazo final para entrega do relatório.' },
    { cal: cal2, title: 'Sprint Planning — Sprint 12', date: fmt(addDays(today,0)), start: '14:00', end: '16:00', color: 'emerald', category: 'Projeto', desc: 'Planejamento do Sprint 12 do projeto Alpha.' },
    { cal: cal2, title: 'Demo Day Produto', date: fmt(addDays(today,7)), start: '15:00', end: '16:30', color: 'rose', category: 'Apresentação', desc: 'Demonstração do produto para os stakeholders.' },
    { cal: cal1, title: 'Revisão de Código PR#47', date: fmt(addDays(today,-1)), start: '11:00', end: '12:00', color: 'sky', category: 'Desenvolvimento', desc: 'Code review do pull request 47.' },
  ];

  for (const ev of events) {
    await client.query(
      `INSERT INTO events (id, calendar_id, title, description, date, end_date, start_time, end_time, color, category, all_day, updated_at)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,0,$10)`,
      [`evt-dev-${uid()}`, ev.cal, ev.title, ev.desc, ev.date, ev.start, ev.end, ev.color, ev.category, now]
    );
  }

  console.log(`[SEED]   ✓ ${events.length} eventos criados`);
  return { cal1, cal2 };
}

async function seedKanban(client) {
  console.log('[SEED] Criando times e boards Kanban...');
  const now = new Date().toISOString();

  // Time
  const teamId = `team-dev-${uid()}`;
  await client.query(
    `INSERT INTO kanban_teams (id, name, description, color, owner_id, created_at, updated_at)
     VALUES ($1,'Time de Desenvolvimento','Equipe principal de dev e produto','#4f46e5',$2,$3,$3)`,
    [teamId, ME.id, now]
  );
  for (const u of USERS) {
    await client.query(
      `INSERT INTO kanban_team_members (id, team_id, user_id, role, joined_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (team_id, user_id) DO NOTHING`,
      [`tmb-dev-${uid()}`, teamId, u.id, u.id === ME.id ? 'admin' : 'member', now]
    );
  }

  // Board
  const boardId = `board-dev-${uid()}`;
  await client.query(
    `INSERT INTO kanban_boards (id, team_id, name, description, color, owner_id, scope_type, created_at, updated_at)
     VALUES ($1,$2,'Sprint 12 — Produto Alpha','Board do sprint atual','#4f46e5',$3,'team',$4,$4)`,
    [boardId, teamId, ME.id, now]
  );
  // O kanban_board tem uma relação com calendars via task_calendar_id — pular pois não é obrigatório para seed

  // Colunas
  const cols = [
    { id: `col-dev-${uid()}`, title: 'Backlog', position: 0, color: '#64748b' },
    { id: `col-dev-${uid()}`, title: 'Em Progresso', position: 1, color: '#3b82f6' },
    { id: `col-dev-${uid()}`, title: 'Revisão', position: 2, color: '#f59e0b' },
    { id: `col-dev-${uid()}`, title: 'Concluído', position: 3, color: '#10b981' },
  ];
  for (const col of cols) {
    await client.query(
      `INSERT INTO kanban_columns (id, board_id, title, position, color, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [col.id, boardId, col.title, col.position, col.color, now]
    );
  }

  // Cards
  const cards = [
    { col: 0, title: 'Implementar login SSO', desc: 'Integrar o fluxo de autenticação SSO com o portal corporativo.', priority: 'high', labels: ['backend','auth'] },
    { col: 0, title: 'Criar tela de Mural', desc: 'Desenvolver o componente visual de mural com grupos e notas.', priority: 'high', labels: ['frontend','ui'] },
    { col: 1, title: 'API de Tarefas', desc: 'Endpoint REST para criação e gestão de cards do kanban.', priority: 'medium', labels: ['backend','api'] },
    { col: 1, title: 'Animações no Kanban', desc: 'Adicionar transições suaves ao arrastar os cards entre colunas.', priority: 'low', labels: ['frontend','ux'] },
    { col: 2, title: 'Testes unitários da API', desc: 'Cobrir endpoints críticos com testes automatizados.', priority: 'medium', labels: ['backend','tests'] },
    { col: 3, title: 'Migração PostgreSQL', desc: 'Migrar dados do SQLite para o banco PostgreSQL de produção.', priority: 'high', labels: ['infra','database'] },
    { col: 3, title: 'Deploy inicial em produção', desc: 'Primeiro deploy para ambiente de produção com IIS.', priority: 'high', labels: ['infra','devops'] },
  ];

  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today = new Date();

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const colId = cols[c.col].id;
    const assignee = USERS[i % USERS.length].id;
    await client.query(
      `INSERT INTO kanban_tasks (id, board_id, column_id, title, description, priority, labels, assignee_id, assignee_ids, due_date, position, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
      [
        `task-dev-${uid()}`, boardId, colId,
        c.title, c.desc, c.priority,
        JSON.stringify(c.labels),
        assignee,
        JSON.stringify([assignee]),
        fmt(addDays(today, 5 + i * 2)),
        i,
        ME.id, now
      ]
    );
  }

  console.log(`[SEED]   ✓ 1 time, 1 board, ${cols.length} colunas, ${cards.length} cards`);
  return { teamId, boardId };
}

async function seedMural(client, teamId) {
  console.log('[SEED] Criando murais e notas...');
  const now = new Date().toISOString();

  // Mural pessoal
  const personalBoardId = `mrl-dev-${uid()}`;
  await client.query(
    `INSERT INTO mural_boards (id, name, description, color, owner_id, scope_type, team_id, created_at, updated_at)
     VALUES ($1,'Meu Mural','Espaço pessoal de notas e ideias','#f59e0b',$2,'personal',NULL,$3,$3)`,
    [personalBoardId, ME.id, now]
  );

  const pg1 = `grp-dev-${uid()}`;
  const pg2 = `grp-dev-${uid()}`;
  await client.query(`INSERT INTO mural_groups (id, mural_id, title, color, position, created_at) VALUES ($1,$2,'Avisos & Lembretes','#f59e0b',0,$3)`, [pg1, personalBoardId, now]);
  await client.query(`INSERT INTO mural_groups (id, mural_id, title, color, position, created_at) VALUES ($1,$2,'Ideias & Projetos','#0ea5e9',1,$3)`, [pg2, personalBoardId, now]);

  const personalItems = [
    { gid: pg1, title: '📌 Renovar VPN', content: 'Verificar com o TI a renovação da licença VPN que vence no próximo mês.', color: '#fef08a', pinned: true, rot: -1.2 },
    { gid: pg1, title: '🔔 Reunião sexta', content: 'Sprint review às 15h na sala de videoconferência. Preparar slides de resultado.', color: '#fed7aa', pinned: false, rot: 0.8 },
    { gid: pg2, title: '💡 Ideia: App de ponto', content: 'Criar integração do sistema de ponto com a Agenda para notificações automáticas de atrasos.', color: '#bbf7d0', pinned: false, rot: 1.5 },
    { gid: pg2, title: '📝 Melhorias no Mural', content: '- Drag & drop entre grupos\n- Markdown nos cartões\n- Exportar como PDF', color: '#e0e7ff', pinned: false, rot: -0.5 },
    { gid: null, title: '🎯 Meta do trimestre', content: 'Lançar o módulo de Mural e Tarefas em produção antes do dia 30/10.', color: '#fce7f3', pinned: true, rot: 0.3 },
  ];

  for (let i = 0; i < personalItems.length; i++) {
    const it = personalItems[i];
    await client.query(
      `INSERT INTO mural_items (id, mural_id, group_id, title, content, color, is_pinned, position, rotation, created_by, created_by_name, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
      [`not-dev-${uid()}`, personalBoardId, it.gid, it.title, it.content, it.color, it.pinned ? 1 : 0, i, it.rot, ME.id, ME.name, now]
    );
  }

  // Mural de time
  const teamBoardId = `mrl-dev-${uid()}`;
  await client.query(
    `INSERT INTO mural_boards (id, name, description, color, owner_id, scope_type, team_id, created_at, updated_at)
     VALUES ($1,'Mural do Time Dev','Quadro compartilhado do time de desenvolvimento','#4f46e5',$2,'team',$3,$4,$4)`,
    [teamBoardId, ME.id, teamId, now]
  );

  const tg1 = `grp-dev-${uid()}`;
  const tg2 = `grp-dev-${uid()}`;
  const tg3 = `grp-dev-${uid()}`;
  await client.query(`INSERT INTO mural_groups (id, mural_id, title, color, position, created_at) VALUES ($1,$2,'Quadro de Avisos','#4f46e5',0,$3)`, [tg1, teamBoardId, now]);
  await client.query(`INSERT INTO mural_groups (id, mural_id, title, color, position, created_at) VALUES ($1,$2,'Documentações & Links','#10b981',1,$3)`, [tg2, teamBoardId, now]);
  await client.query(`INSERT INTO mural_groups (id, mural_id, title, color, position, created_at) VALUES ($1,$2,'Retrospectiva Sprint 11','#f59e0b',2,$3)`, [tg3, teamBoardId, now]);

  const teamItems = [
    { gid: tg1, uid: USERS[0].id, name: USERS[0].name, title: '📢 Novo processo de deploy', content: 'A partir desta semana, todos os deploys devem ser aprovados por 2 revisores antes de ir para produção. Consulte o guia no Confluence.', color: '#e0e7ff', pinned: true, rot: -1.0 },
    { gid: tg1, uid: USERS[1].id, name: USERS[1].name, title: '⚠️ Servidor de HML indisponível', content: 'O servidor de homologação estará em manutenção na quinta-feira das 22h às 6h. Planejem os testes.', color: '#fef9c3', pinned: false, rot: 0.7 },
    { gid: tg2, uid: USERS[2].id, name: USERS[2].name, title: '📖 Padrões de código Angular', content: 'Seguir o guia em: http://wiki.empresa.local/angular-style-guide\nPrincipal: usar signals, evitar Subscribe sem unsubscribe.', color: '#d1fae5', pinned: false, rot: -0.3 },
    { gid: tg2, uid: ME.id, name: ME.name, title: '🔗 Acesso PostgreSQL Dev', content: 'Host: 192.168.13.244\nPorta: 5432\nBanco: agenda_dev\nUsuário: postgres', color: '#fce7f3', pinned: true, rot: 1.2 },
    { gid: tg3, uid: USERS[0].id, name: USERS[0].name, title: '✅ O que foi bem', content: '- Entrega do módulo de Kanban no prazo\n- Cobertura de testes acima de 80%\n- Boa comunicação entre devs e PO', color: '#bbf7d0', pinned: false, rot: -1.5 },
    { gid: tg3, uid: USERS[1].id, name: USERS[1].name, title: '🔧 Melhorias para o próximo', content: '- Automatizar o processo de build\n- Melhorar tempo de resposta da API de eventos\n- Mais testes de integração', color: '#fed7aa', pinned: false, rot: 0.4 },
    { gid: null, uid: ME.id, name: ME.name, title: '🏆 Meta do time Q4', content: 'Atingir NPS interno de 8.5 e entregar o módulo de Relatórios antes do final do trimestre.', color: '#fef08a', pinned: true, rot: -0.8 },
  ];

  for (let i = 0; i < teamItems.length; i++) {
    const it = teamItems[i];
    await client.query(
      `INSERT INTO mural_items (id, mural_id, group_id, title, content, color, is_pinned, position, rotation, created_by, created_by_name, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
      [`not-dev-${uid()}`, teamBoardId, it.gid, it.title, it.content, it.color, it.pinned ? 1 : 0, i, it.rot, it.uid, it.name, now]
    );
  }

  console.log(`[SEED]   ✓ 2 murais, 5 grupos, ${personalItems.length + teamItems.length} notas`);
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`[SEED] Banco de dados: ${process.env.PGDATABASE}`);
    console.log('[SEED] Iniciando seed de dados fictícios...\n');

    await clearDev(client);
    await seedCalendars(client);
    const { teamId } = await seedKanban(client);
    await seedMural(client, teamId);

    console.log('\n[SEED] ✅ Seed concluído com sucesso!');
    console.log('[SEED]    Acesse o app com npm run dev e explore os dados.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('[SEED] ❌ Erro:', err.message);
  console.error(err.stack);
  process.exitCode = 1;
});
