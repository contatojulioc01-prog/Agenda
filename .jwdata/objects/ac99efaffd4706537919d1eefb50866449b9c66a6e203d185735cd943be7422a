const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPaths = [
  path.join(__dirname, '..', '..', '.env'),
  path.join(__dirname, '..', '.env')
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false, quiet: true });
}

const db = require('../db');
const { migrateAttachmentsToDisk, ATTACHMENTS_DIR } = require('../routes/attachments');

async function main() {
  console.log('--- Iniciando Migração de Anexos para Disco ---');
  console.log('Diretório de Destino:', ATTACHMENTS_DIR);
  
  await db.initDb();

  const countBefore = await db.get('SELECT COUNT(*) as total FROM attachments WHERE content IS NOT NULL');
  console.log(`Anexos com conteúdo binário no PostgreSQL: ${countBefore.total}`);

  await migrateAttachmentsToDisk(db);

  const countAfter = await db.get('SELECT COUNT(*) as total FROM attachments WHERE content IS NOT NULL');
  console.log(`Anexos restantes com conteúdo no PostgreSQL: ${countAfter.total}`);

  const totalInDb = await db.get('SELECT COUNT(*) as total FROM attachments');
  console.log(`Total de anexos cadastrados no banco (metadados): ${totalInDb.total}`);

  await db.closeDb();
  console.log('--- Migração Concluída com Sucesso ---');
}

main().catch(err => {
  console.error('Erro na execução do script:', err);
  process.exit(1);
});
