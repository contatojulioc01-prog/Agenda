const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env
const envPaths = [path.join(__dirname, '..', '..', '.env'), path.join(__dirname, '..', '.env')];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false, quiet: true });
}

const { initDb, closeDb } = require('../db');

const id = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function seedLinkedIn() {
  console.log('[SEED] Conectando ao banco de dados...');
  const pool = await initDb();

  // Permite passar o ID do usuário como argumento (ex: node scripts/seed-linkedin.js meu-user-id)
  const argUserId = process.argv[2];

  let ownerId = argUserId;
  if (!ownerId) {
    const userResult = await pool.query(`
      SELECT DISTINCT owner_id FROM calendars 
      WHERE owner_id IS NOT NULL AND owner_id != ''
      LIMIT 1
    `);
    ownerId = userResult.rows[0]?.owner_id || 'dev-local-user';
  }

  console.log(`[SEED] 👤 Vinculando dados ao usuário: "${ownerId}"`);
  const now = new Date().toISOString();

  // ═════════════════════════════════════════════════════════════
  // 1. CRIAR AGENDA LINKEDIN & EVENTOS
  // ═════════════════════════════════════════════════════════════
  let calendarId;
  const existingCal = await pool.query(`
    SELECT id FROM calendars 
    WHERE owner_id = $1 AND LOWER(name) = 'linkedin' AND is_task_calendar = 0
    LIMIT 1
  `, [ownerId]);

  if (existingCal.rows.length > 0) {
    calendarId = existingCal.rows[0].id;
    console.log(`[SEED] Agenda 'LinkedIn' encontrada (ID: ${calendarId})`);
  } else {
    calendarId = id('cal');
    await pool.query(`
      INSERT INTO calendars (id, name, color, is_private, owner_id, is_default, is_task_calendar, created_at)
      VALUES ($1, $2, $3, 0, $4, 0, 0, $5)
    `, [calendarId, 'LinkedIn', '#0077b5', ownerId, now]);

    await pool.query(`
      INSERT INTO calendar_members (id, calendar_id, user_id, permission)
      VALUES ($1, $2, $3, 'owner')
    `, [id('mbr'), calendarId, ownerId]);
    console.log(`[SEED] Agenda 'LinkedIn' criada com sucesso! (ID: ${calendarId})`);
  }

  // Eventos para apresentar o projeto no LinkedIn
  const events = [
    {
      title: 'Planejamento e Roteiro da Demonstração do Projeto',
      description: 'Definir os principais diferenciais a serem exibidos no LinkedIn: visual moderno, alternância de temas, recorrência mensal avançada, painel Kanban e exportação em alta fidelidade para PDF/impressão.',
      date: '2026-09-24',
      endDate: '2026-09-24',
      startTime: '09:00',
      endTime: '11:00',
      color: 'blue',
      category: 'Planejamento',
    },
    {
      title: 'Gravação do Vídeo de Apresentação (Screencast)',
      description: 'Gravar vídeo em alta resolução demonstrando o uso real da Agenda Corporativa e do Kanban. Mostrar o fluxo de arrastar tarefas, detalhes com checklist e facilidade de navegação.',
      date: '2026-09-25',
      endDate: '2026-09-25',
      startTime: '14:00',
      endTime: '16:30',
      color: 'indigo',
      category: 'Mídia',
    },
    {
      title: 'Redação do Post de Lançamento (Storytelling & Stack)',
      description: 'Escrever o texto do post para o LinkedIn com foco em valor: problema resolvido, tecnologias aplicadas (Angular, Node.js, PostgreSQL, RxJS, CSS Glassmorphism) e arquitetura em tempo real.',
      date: '2026-09-26',
      endDate: '2026-09-26',
      startTime: '10:00',
      endTime: '12:00',
      color: 'amber',
      category: 'Conteúdo',
    },
    {
      title: 'Publicação Oficial do Projeto no LinkedIn 🚀',
      description: 'Publicar o vídeo, carrossel de imagens e texto de apresentação no horário de maior engajamento. Convidar conexões para interagir e conhecer a aplicação.',
      date: '2026-09-28',
      endDate: '2026-09-28',
      startTime: '09:00',
      endTime: '10:30',
      color: 'emerald',
      category: 'Lançamento',
    },
    {
      title: 'Acompanhamento de Métricas e Respostas aos Comentários',
      description: 'Interagir com os feedbacks da rede, responder perguntas sobre a arquitetura e conectar com recrutadores e profissionais interessados.',
      date: '2026-09-29',
      endDate: '2026-09-29',
      startTime: '15:00',
      endTime: '16:00',
      color: 'purple',
      category: 'Networking',
    },
  ];

  for (const ev of events) {
    const existingEv = await pool.query(`
      SELECT id FROM events 
      WHERE calendar_id = $1 AND title = $2
    `, [calendarId, ev.title]);

    if (existingEv.rows.length === 0) {
      await pool.query(`
        INSERT INTO events (id, calendar_id, title, description, date, end_date, start_time, end_time, color, category, all_day, created_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12)
      `, [id('ev'), calendarId, ev.title, ev.description, ev.date, ev.endDate, ev.startTime, ev.endTime, ev.color, ev.category, ownerId, now]);
      console.log(`  + Evento criado: "${ev.title}"`);
    }
  }

  // ═════════════════════════════════════════════════════════════
  // 2. CRIAR TIME LINKEDIN NO KANBAN COM ABAS E TAREFAS
  // ═════════════════════════════════════════════════════════════
  let teamId;
  let boardId;

  const existingTeam = await pool.query(`
    SELECT id FROM kanban_teams 
    WHERE LOWER(name) = 'linkedin'
    LIMIT 1
  `);

  if (existingTeam.rows.length > 0) {
    teamId = existingTeam.rows[0].id;
    const existingBrd = await pool.query('SELECT id FROM kanban_boards WHERE team_id = $1 LIMIT 1', [teamId]);
    boardId = existingBrd.rows[0]?.id;
    console.log(`[SEED] Time 'LinkedIn' encontrado (ID: ${teamId}, Board: ${boardId})`);
  } else {
    teamId = id('tm');
    boardId = id('brd');
    const teamCalId = id('cal-team');

    // Inserir Time
    await pool.query(`
      INSERT INTO kanban_teams (id, name, description, color, owner_id, created_at, updated_at)
      VALUES ($1, 'LinkedIn', 'Planejamento e execução da divulgação e apresentação do projeto no LinkedIn', '#0077b5', $2, $3, $3)
    `, [teamId, ownerId, now]);

    // Inserir Membro como Admin
    await pool.query(`
      INSERT INTO kanban_team_members (id, team_id, user_id, role, joined_at)
      VALUES ($1, $2, $3, 'admin', $4)
    `, [id('mbr'), teamId, ownerId, now]);

    // Inserir Agenda Automática de Tarefas do Time
    await pool.query(`
      INSERT INTO calendars (id, name, color, is_private, owner_id, is_default, is_task_calendar, created_at)
      VALUES ($1, 'Tarefas · LinkedIn', '#0077b5', 0, $2, 0, 1, $3)
    `, [teamCalId, ownerId, now]);

    await pool.query(`
      INSERT INTO calendar_members (id, calendar_id, user_id, permission)
      VALUES ($1, $2, $3, 'owner')
    `, [id('mbr'), teamCalId, ownerId]);

    // Inserir Board do Time
    await pool.query(`
      INSERT INTO kanban_boards (id, name, description, color, owner_id, created_at, updated_at, scope_type, team_id)
      VALUES ($1, 'Kanban · LinkedIn', 'Quadro de divulgação e apresentação do projeto', '#0077b5', $2, $3, $3, 'team', $4)
    `, [boardId, ownerId, now, teamId]);

    console.log(`[SEED] Time e Quadro 'LinkedIn' criados com sucesso! (Team: ${teamId}, Board: ${boardId})`);
  }

  // ═════════════════════════════════════════════════════════════
  // 3. DEFINIR ABAS / COLUNAS PERSONALIZADAS DO QUADRO LINKEDIN
  // ═════════════════════════════════════════════════════════════
  const columnsConfig = [
    { title: '💡 Ideias & Estratégia', color: '#6366f1' },
    { title: '✍️ Criação de Conteúdo', color: '#f59e0b' },
    { title: '🎬 Gravação & Design', color: '#ec4899' },
    { title: '🔍 Revisão Final', color: '#8b5cf6' },
    { title: '🚀 Publicado & Engajamento', color: '#10b981' },
  ];

  const colMap = {};
  for (let i = 0; i < columnsConfig.length; i++) {
    const colCfg = columnsConfig[i];
    let colRow = await pool.query(`
      SELECT id FROM kanban_columns 
      WHERE board_id = $1 AND title = $2
    `, [boardId, colCfg.title]);

    if (colRow.rows.length === 0) {
      const colId = id('col');
      await pool.query(`
        INSERT INTO kanban_columns (id, board_id, title, color, position, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [colId, boardId, colCfg.title, colCfg.color, i, now]);
      colMap[colCfg.title] = colId;
      console.log(`  + Coluna criada: "${colCfg.title}"`);
    } else {
      colMap[colCfg.title] = colRow.rows[0].id;
    }
  }

  // ═════════════════════════════════════════════════════════════
  // 4. CRIAR TAREFAS NAS ABAS DO LINKEDIN
  // ═════════════════════════════════════════════════════════════
  const tasks = [
    // 💡 Ideias & Estratégia
    {
      columnTitle: '💡 Ideias & Estratégia',
      title: 'Mapear os diferenciais técnicos e visuais do projeto',
      description: 'Listar o que torna este sistema único para enfatizar no LinkedIn:\n- **Temas Customizados:** Angel, Demon e o easter egg do Cadu Maverick com transparência.\n- **Impressão Otimizada:** Exportação profissional do Kanban em 1 página e ficha individual de tarefas.\n- **Assistente IA Integrado:** Respostas contextuais em streaming SSE.',
      priority: 'high',
      dueDate: '2026-09-24',
      labels: ['Estratégia', 'Diferenciais'],
      checklist: [
        { id: id('chk'), text: 'Listar as 4 principais inovações do projeto', done: true },
        { id: id('chk'), text: 'Definir o público-alvo (tech recruiters, devs, tech leads)', done: true },
        { id: id('chk'), text: 'Selecionar hashtags estratégicas (#Angular, #TypeScript, #NodeJS, #PostgreSQL)', done: false },
      ],
    },
    {
      columnTitle: '💡 Ideias & Estratégia',
      title: 'Pesquisar posts e formatos de maior engajamento',
      description: 'Analisar posts de portfólio bem-sucedidos no LinkedIn:\n- Formato Carrossel (PDF com slides de alta retenção)\n- Vídeo curto (60 a 90 segundos) com legendas dinâmicas\n- Chamada inicial forte (headline que prende a atenção).',
      priority: 'medium',
      dueDate: '2026-09-24',
      labels: ['Benchmark', 'LinkedIn'],
      checklist: [
        { id: id('chk'), text: 'Salvar 3 referências de publicações virais de projetos', done: true },
        { id: id('chk'), text: 'Definir estrutura do post (Problema -> Solução -> Stack -> Demo)', done: false },
      ],
    },

    // ✍️ Criação de Conteúdo
    {
      columnTitle: '✍️ Criação de Conteúdo',
      title: 'Escrever o texto principal do post de apresentação',
      description: 'Redigir a copy utilizando storytelling:\n\n"Desenvolvi um sistema corporativo completo de Gestão de Agenda & Tarefas com foco em experiência do usuário e alta produtividade..."\n\nDestacar arquitetura robusta, performance e atenção a detalhes de design.',
      priority: 'urgent',
      dueDate: '2026-09-25',
      labels: ['Copywriting', 'Post'],
      checklist: [
        { id: id('chk'), text: 'Criar headline chamativa', done: true },
        { id: id('chk'), text: 'Escrever corpo do texto com tópicos escaneáveis', done: false },
        { id: id('chk'), text: 'Adicionar links para demonstração e GitHub', done: false },
        { id: id('chk'), text: 'Inserir Call To Action convidando para feedback', done: false },
      ],
    },
    {
      columnTitle: '✍️ Criação de Conteúdo',
      title: 'Elaborar roteiro do vídeo demonstrativo',
      description: 'Roteiro segundo a segundo para a gravação:\n- 00:00 - 00:15: Visão geral da interface e visual moderno\n- 00:15 - 00:35: Calendário, eventos recorrentes mensais\n- 00:35 - 00:55: Kanban interativo com drag-and-drop e impressão\n- 00:55 - 01:15: Assistente IA integrado e temas personalizados.',
      priority: 'high',
      dueDate: '2026-09-25',
      labels: ['Roteiro', 'Vídeo'],
      checklist: [
        { id: id('chk'), text: 'Roteiro de 75 segundos finalizado', done: true },
        { id: id('chk'), text: 'Pontos de clique e demonstração mapeados', done: true },
      ],
    },

    // 🎬 Gravação & Design
    {
      columnTitle: '🎬 Gravação & Design',
      title: 'Gravar e editar vídeo demonstrativo em alta definição',
      description: 'Gravar tela a 60fps mostrando a fluidez da aplicação. Aplicar zoom suave nos detalhes e incluir legendas automáticas para visualização sem áudio.',
      priority: 'urgent',
      dueDate: '2026-09-26',
      labels: ['Gravação', 'Vídeo'],
      checklist: [
        { id: id('chk'), text: 'Gravar tela em 1080p/60fps', done: false },
        { id: id('chk'), text: 'Cortar pausas e acelerar transições longas', done: false },
        { id: id('chk'), text: 'Adicionar legendas e trilha sonora suave', done: false },
        { id: id('chk'), text: 'Exportar vídeo otimizado para o player do LinkedIn', done: false },
      ],
    },
    {
      columnTitle: '🎬 Gravação & Design',
      title: 'Criar carrossel de imagens e mockup dos temas',
      description: 'Desenvolver slides visuais (PDF) para publicação em carrossel:\n- Slide 1: Capa impactante do projeto\n- Slide 2: Recursos do Calendário & Notificações\n- Slide 3: Quadro Kanban & Ficha de Impressão\n- Slide 4: Temas exclusivos (Light, Dark, Cadu Maverick)\n- Slide 5: Stack Tecnológica & Contato.',
      priority: 'high',
      dueDate: '2026-09-27',
      labels: ['Design', 'Carrossel'],
      checklist: [
        { id: id('chk'), text: 'Capturar screenshots em alta resolução', done: true },
        { id: id('chk'), text: 'Montar slides no Canva / Figma', done: false },
        { id: id('chk'), text: 'Exportar PDF de alta qualidade para o LinkedIn', done: false },
      ],
    },

    // 🔍 Revisão Final
    {
      columnTitle: '🔍 Revisão Final',
      title: 'Revisão ortográfica, links e testes de responsividade',
      description: 'Checklist final antes do clique de publicação:\n- Verificar se todos os links (GitHub, portfólio) estão funcionando\n- Conferir concordância e formatação do texto\n- Garantir que a miniatura e o vídeo estão no padrão correto.',
      priority: 'medium',
      dueDate: '2026-09-27',
      labels: ['QA', 'Revisão'],
      checklist: [
        { id: id('chk'), text: 'Revisão gramatical completa', done: false },
        { id: id('chk'), text: 'Testar link público da aplicação', done: false },
        { id: id('chk'), text: 'Verificar pré-visualização do post no mobile', done: false },
      ],
    },

    // 🚀 Publicado & Engajamento
    {
      columnTitle: '🚀 Publicado & Engajamento',
      title: 'Publicar no LinkedIn no horário nobre e engajar',
      description: 'Disparar a postagem entre 08:30 e 09:30 da manhã.\n- Compartilhar com colegas e grupos de tecnologia\n- Responder prontamente a cada comentário nas primeiras 2 horas\n- Acompanhar visualizações e novos contatos gerados.',
      priority: 'urgent',
      dueDate: '2026-09-28',
      labels: ['Lançamento', 'Engajamento'],
      checklist: [
        { id: id('chk'), text: 'Publicar post com vídeo e texto formatado', done: false },
        { id: id('chk'), text: 'Responder todos os comentários nas primeiras 24h', done: false },
        { id: id('chk'), text: 'Coletar feedbacks e planejar próximos passos', done: false },
      ],
    },
  ];

  for (const t of tasks) {
    const colId = colMap[t.columnTitle];
    if (!colId) continue;

    const existingTask = await pool.query(`
      SELECT id FROM kanban_tasks 
      WHERE board_id = $1 AND title = $2
    `, [boardId, t.title]);

    if (existingTask.rows.length === 0) {
      await pool.query(`
        INSERT INTO kanban_tasks (
          id, board_id, column_id, title, description, position, priority, 
          due_date, labels, assignee_ids, checklist, archived, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, 0, $11, $12, $12)
      `, [
        id('tsk'),
        boardId,
        colId,
        t.title,
        t.description,
        t.priority,
        t.dueDate,
        JSON.stringify(t.labels),
        JSON.stringify([ownerId]),
        JSON.stringify(t.checklist),
        ownerId,
        now,
      ]);
      console.log(`  + Tarefa criada: "${t.title}" na coluna "${t.columnTitle}"`);
    }
  }

  console.log(`\n[SEED] ✅ Concluído para o usuário: "${ownerId}"!`);
  await closeDb();
}

seedLinkedIn().catch(err => {
  console.error('[SEED] Erro ao popular dados do LinkedIn:', err);
  process.exit(1);
});
