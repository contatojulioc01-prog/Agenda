const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootPath = __dirname;
const backendPath = path.join(rootPath, 'backend');
const dependencyMarker = path.join(backendPath, 'node_modules', 'express', 'package.json');
const frontendCandidates = [
  path.join(rootPath, 'frontend', 'index.html'),
  path.join(rootPath, 'dist', 'agenda', 'browser', 'index.html'),
];

function runNpm(args, cwd) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

if (!fs.existsSync(dependencyMarker)) {
  console.log('[START] Primeira execucao: instalando dependencias do backend...');
  runNpm(['ci', '--omit=dev'], backendPath);
}

if (!frontendCandidates.some(fs.existsSync)) {
  console.error('[START] Frontend compilado nao encontrado. Gere o pacote com "npm run build".');
  process.exit(1);
}

console.log('[START] Iniciando Agenda em 0.0.0.0:9900...');
require('./backend/index.js');
