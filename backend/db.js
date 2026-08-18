const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'agenda.db');

let db = null;

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Criar tabelas se não existirem
  db.run(`
    CREATE TABLE IF NOT EXISTS calendars (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      color       TEXT NOT NULL DEFAULT '#4f46e5',
      is_private  INTEGER NOT NULL DEFAULT 0,
      owner_id    TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calendar_members (
      id          TEXT PRIMARY KEY,
      calendar_id TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      permission  TEXT NOT NULL DEFAULT 'viewer',
      UNIQUE(calendar_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id           TEXT PRIMARY KEY,
      calendar_id  TEXT NOT NULL,
      title        TEXT NOT NULL,
      description  TEXT DEFAULT '',
      date         TEXT NOT NULL,
      end_date     TEXT,
      start_time   TEXT NOT NULL DEFAULT '09:00',
      end_time     TEXT NOT NULL DEFAULT '10:00',
      day_times    TEXT DEFAULT '{}',
      color        TEXT NOT NULL DEFAULT 'indigo',
      category     TEXT DEFAULT 'Geral',
      all_day      INTEGER NOT NULL DEFAULT 0,
      created_by   TEXT,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration segura para bancos já existentes
  try {
    db.run('ALTER TABLE events ADD COLUMN end_date TEXT');
  } catch (e) {
    // Coluna já existe
  }

  try {
    db.run('ALTER TABLE events ADD COLUMN day_times TEXT');
  } catch (e) {
    // Coluna já existe
  }

  persist(); // Salva o DB inicial
  console.log('[DB] SQLite inicializado via sql.js (WebAssembly)');
  return db;
}

/** Persiste o banco em disco após cada modificação */
function persist() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/** Executa uma query e retorna todos os resultados como array de objetos */
function all(sql, params = []) {
  if (!db) throw new Error('DB não inicializado');
  const stmt = db.prepare(sql);
  const rows = [];
  stmt.bind(params);
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/** Executa uma query e retorna o primeiro resultado */
function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

/** Executa uma query de escrita (INSERT/UPDATE/DELETE) */
function run(sql, params = []) {
  if (!db) throw new Error('DB não inicializado');
  db.run(sql, params);
  persist();
}

module.exports = { initDb, all, get, run };
