import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Based on utf8-guard/scripts/check_utf8.mjs, including C# and PowerShell.
const extensions = new Set(['.ts', '.js', '.mjs', '.cjs', '.json', '.html', '.scss', '.css', '.md', '.txt', '.xml', '.cs', '.ps1', '.manifest']);
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0');
let count = 0;
let failures = 0;
for (const file of new Set(files)) {
  if (!file || !fs.existsSync(file) || !extensions.has(path.extname(file))) continue;
  if (/(^|\/)(node_modules|public|release|dist|\.angular)\//.test(file)) continue;
  let content;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file)); }
  catch { console.error(`INVALID UTF-8: ${file}`); failures++; continue; }
  count++;
  content.split(/\r?\n/).forEach((line, index) => {
    // Narrow exceptions for correctly encoded Portuguese in these existing files.
    let checked = line;
    if (['frontend/src/app/core/models/calendar.model.ts', 'frontend/src/app/core/models/event.model.ts'].includes(file)) checked = checked.replaceAll('Âmbar', 'amber');
    if (file === 'frontend/src/styles.scss' && line.includes('pointer-events: none')) checked = checked.replaceAll('NÃO', 'NAO');
    if (file === 'backend/scripts/migrate-sqlite-to-postgres.js') checked = checked.replaceAll('[MIGRAÇÃO]', '[MIGRACAO]');
    if (file === 'backend/scripts/generate-security-report.js' && line.trim().startsWith('<!--')) {
      for (const word of ['GESTÃO', 'AUTENTICAÇÃO', 'MITIGAÇÃO']) checked = checked.replaceAll(word, 'PORTUGUESE_HEADING');
    }
    if (file === 'scripts/check_utf8.mjs') return;
    if (/\u00c3|\u00c2|\u00e2\u20ac\u2122|\u00e2\u20ac\u0153|\u00e2\u20ac\u201d|\ufffd/u.test(checked)) {
      // Report only location: environment files or documentation might contain secrets.
      console.error(`MOJIBAKE ${file}:${index + 1}`); failures++;
    }
  });
}
if (failures) process.exit(1);
console.log(`UTF-8 OK: ${count} source/configuration/documentation files checked`);
