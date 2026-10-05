const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPaths = [path.join(__dirname, '..', '..', '.env'), path.join(__dirname, '..', '.env')];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false, quiet: true });
}
const { Client } = require('pg');

const identifier = value => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(value)) throw new Error(`Identificador PostgreSQL inválido: ${value}`);
  return `"${value.replace(/"/g, '""')}"`;
};
const literal = value => `'${String(value).replace(/'/g, "''")}'`;

function settings() {
  const ssl = String(process.env.PGSSL || '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false;
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: Number(url.port || 5432),
      database: url.pathname.slice(1) || 'agenda',
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl,
    };
  }
  return {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'agenda',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    ssl,
  };
}

async function main() {
  const app = settings();
  const admin = new Client({
    host: app.host,
    port: app.port,
    database: process.env.PGADMINDB || 'postgres',
    user: process.env.PGADMINUSER || app.user,
    password: process.env.PGADMINPASSWORD || app.password,
    ssl: app.ssl,
  });
  await admin.connect();

  const role = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [app.user]);
  if (!role.rowCount) {
    await admin.query(`CREATE ROLE ${identifier(app.user)} LOGIN PASSWORD ${literal(app.password)}`);
    console.log(`[DB] Usuário ${app.user} criado.`);
  }

  const database = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [app.database]);
  if (!database.rowCount) {
    await admin.query(`CREATE DATABASE ${identifier(app.database)} OWNER ${identifier(app.user)} ENCODING 'UTF8'`);
    console.log(`[DB] Database ${app.database} criado.`);
  } else {
    console.log(`[DB] Database ${app.database} já existe.`);
  }
  await admin.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${identifier(app.database)} TO ${identifier(app.user)}`);
  await admin.end();

  const schemaAdmin = new Client({
    host: app.host,
    port: app.port,
    database: app.database,
    user: process.env.PGADMINUSER || app.user,
    password: process.env.PGADMINPASSWORD || app.password,
    ssl: app.ssl,
  });
  await schemaAdmin.connect();
  await schemaAdmin.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${identifier(app.user)}`);
  await schemaAdmin.end();

  const db = require('../db');
  await db.initDb();
  await db.closeDb();
  console.log('[DB] Estrutura da Agenda criada/atualizada com sucesso.');
}

main().catch(error => {
  console.error('[DB] Falha ao preparar PostgreSQL:', error.message);
  process.exitCode = 1;
});
