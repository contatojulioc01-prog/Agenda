const { Pool } = require('pg');

let pool = null;

function connectionConfig() {
  const sslEnabled = String(process.env.PGSSL || '').toLowerCase() === 'true';
  const hasDiscreteConfig = Boolean(
    process.env.PGHOST || process.env.PGDATABASE || process.env.PGUSER || process.env.PGPASSWORD
  );

  // As variaveis PG* do .env da Agenda tem prioridade sobre uma DATABASE_URL
  // global que possa existir no servidor para outro sistema.
  if (process.env.DATABASE_URL && !hasDiscreteConfig) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    };
  }

  return {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'agenda',
    user: process.env.PGUSER || 'postgres',
    password: String(process.env.PGPASSWORD || ''),
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  };
}

function toPostgresParams(sql) {
  let index = 0;
  let quoted = false;
  let result = '';
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'") {
      result += char;
      if (quoted && sql[i + 1] === "'") {
        result += sql[++i];
      } else {
        quoted = !quoted;
      }
    } else if (char === '?' && !quoted) {
      result += `$${++index}`;
    } else {
      result += char;
    }
  }
  return result;
}

async function initDb() {
  if (pool) return pool;
  pool = new Pool({ ...connectionConfig(), max: Number(process.env.PGPOOL_MAX || 10) });
  pool.on('error', error => console.error('[DB] Erro inesperado no pool PostgreSQL:', error));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendars (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#4f46e5',
      is_private INTEGER NOT NULL DEFAULT 0,
      owner_id TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_task_calendar INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
    );

    CREATE TABLE IF NOT EXISTS calendar_members (
      id TEXT PRIMARY KEY,
      calendar_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'viewer',
      UNIQUE(calendar_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS calendar_invitations (
      id TEXT PRIMARY KEY,
      calendar_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'viewer',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
      UNIQUE(calendar_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      calendar_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      date TEXT NOT NULL,
      end_date TEXT,
      start_time TEXT NOT NULL DEFAULT '09:00',
      end_time TEXT NOT NULL DEFAULT '10:00',
      day_times TEXT DEFAULT '{}',
      color TEXT NOT NULL DEFAULT 'indigo',
      category TEXT DEFAULT 'Geral',
      all_day INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      copy_group_id TEXT,
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
    );

    CREATE TABLE IF NOT EXISTS kanban_teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      color TEXT NOT NULL DEFAULT '#4f46e5',
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
    );

    CREATE TABLE IF NOT EXISTS kanban_boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      color TEXT NOT NULL DEFAULT '#4f46e5',
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
      scope_type TEXT NOT NULL DEFAULT 'personal',
      team_id TEXT
    );

    CREATE TABLE IF NOT EXISTS kanban_columns (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      title TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#64748b',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
    );

    CREATE TABLE IF NOT EXISTS kanban_tasks (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      column_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TEXT,
      labels TEXT NOT NULL DEFAULT '[]',
      assignee_id TEXT,
      checklist TEXT NOT NULL DEFAULT '[]',
      archived INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
      parent_task_id TEXT,
      assignee_ids TEXT NOT NULL DEFAULT '[]',
      deleted_at TEXT,
      deleted_by TEXT
    );

    CREATE TABLE IF NOT EXISTS kanban_team_members (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
      UNIQUE(team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS kanban_team_invitations (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      invited_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
      UNIQUE(team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS kanban_task_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      calendar_id TEXT NOT NULL,
      UNIQUE(task_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL CHECK (owner_type IN ('event', 'task')),
      owner_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      byte_size INTEGER NOT NULL,
      content BYTEA NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
    );

    CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(calendar_id, date);
    CREATE INDEX IF NOT EXISTS idx_calendar_members_user ON calendar_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_tasks_board ON kanban_tasks(board_id, parent_task_id, column_id, position);
    CREATE INDEX IF NOT EXISTS idx_kanban_team_members_user ON kanban_team_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments(owner_type, owner_id, created_at);

    ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date TEXT;
    ALTER TABLE calendars ADD COLUMN IF NOT EXISTS is_default INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE calendars ADD COLUMN IF NOT EXISTS is_task_calendar INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS day_times TEXT DEFAULT '{}';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS copy_group_id TEXT;
    ALTER TABLE kanban_boards ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'personal';
    ALTER TABLE kanban_boards ADD COLUMN IF NOT EXISTS team_id TEXT;
    ALTER TABLE kanban_teams ADD COLUMN IF NOT EXISTS calendar_id TEXT;
    ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS parent_task_id TEXT;
    ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS assignee_ids TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS deleted_at TEXT;
    ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS deleted_by TEXT;
    CREATE INDEX IF NOT EXISTS idx_kanban_tasks_trash ON kanban_tasks(board_id, deleted_at) WHERE deleted_at IS NOT NULL;

    UPDATE calendars
    SET name = 'Tarefas', color = kanban_teams.color, is_private = 0, is_task_calendar = 1
    FROM kanban_teams
    WHERE kanban_teams.calendar_id = calendars.id;

    WITH defaults AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY owner_id ORDER BY created_at, id) row_number
      FROM calendars WHERE name = 'Minha Agenda' AND is_private = 1
    )
    UPDATE calendars SET is_default = 1
    FROM defaults WHERE calendars.id = defaults.id AND defaults.row_number = 1
      AND NOT EXISTS (SELECT 1 FROM calendars existing WHERE existing.owner_id = calendars.owner_id AND existing.is_default = 1);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_calendars_default_owner ON calendars(owner_id) WHERE is_default = 1;
  `);

  console.log(`[DB] PostgreSQL conectado em ${process.env.PGDATABASE || 'agenda'}`);
  return pool;
}

function requirePool() {
  if (!pool) throw new Error('PostgreSQL não inicializado');
  return pool;
}

async function all(sql, params = [], client = null) {
  const result = await (client || requirePool()).query(toPostgresParams(sql), params);
  return result.rows;
}

async function get(sql, params = [], client = null) {
  const rows = await all(sql, params, client);
  return rows[0] || null;
}

async function run(sql, params = [], client = null) {
  return (client || requirePool()).query(toPostgresParams(sql), params);
}

async function transaction(callback) {
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    const tx = {
      all: (sql, params = []) => all(sql, params, client),
      get: (sql, params = []) => get(sql, params, client),
      run: (sql, params = []) => run(sql, params, client),
    };
    const result = await callback(tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function closeDb() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = { initDb, all, get, run, transaction, closeDb, connectionConfig, toPostgresParams };
