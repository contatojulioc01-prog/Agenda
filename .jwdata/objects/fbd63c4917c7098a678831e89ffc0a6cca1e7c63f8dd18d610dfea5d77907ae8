require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const postgres = require('../db');

const SQLITE_PATH = path.join(__dirname, '..', 'agenda.db');
const TABLES = [
  'calendars',
  'calendar_members',
  'calendar_invitations',
  'events',
  'kanban_teams',
  'kanban_boards',
  'kanban_columns',
  'kanban_tasks',
  'kanban_team_members',
  'kanban_team_invitations',
  'kanban_task_events',
];

function sqliteRows(database, table) {
  let result;
  try { result = database.exec(`SELECT * FROM "${table}"`)[0]; } catch { return []; }
  if (!result) return [];
  return result.values.map(values => Object.fromEntries(result.columns.map((column, index) => [column, values[index]])));
}

async function main() {
  if (!fs.existsSync(SQLITE_PATH)) throw new Error(`Arquivo não encontrado: ${SQLITE_PATH}`);
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database(fs.readFileSync(SQLITE_PATH));
  await postgres.initDb();

  let imported = 0;
  await postgres.transaction(async tx => {
    for (const table of TABLES) {
      const rows = sqliteRows(sqlite, table);
      let tableImported = 0;
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map(column => row[column] === undefined ? null : row[column]);
        const placeholders = columns.map(() => '?').join(', ');
        const result = await tx.run(`INSERT INTO "${table}" (${columns.map(column => `"${column}"`).join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
        tableImported += result.rowCount || 0;
      }
      imported += tableImported;
      console.log(`[MIGRAÇÃO] ${table}: ${tableImported}/${rows.length} registros importados.`);
    }
  });

  sqlite.close();
  await postgres.closeDb();
  console.log(`[MIGRAÇÃO] Concluída. ${imported} registros novos importados para o PostgreSQL.`);
}

main().catch(error => {
  console.error('[MIGRAÇÃO] Falha:', error.message);
  process.exitCode = 1;
});
