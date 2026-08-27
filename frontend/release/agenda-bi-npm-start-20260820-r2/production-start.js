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
  // Quando iniciado por `npm start`, o npm informa o caminho do seu CLI.
  // Executa-lo pelo proprio Node evita o EINVAL ao abrir npm.cmd no Windows.
  const npmCliPath = process.env.npm_execpath;
  const command = npmCliPath ? process.execPath : (process.platform === 'win32' ? 'cmd.exe' : 'npm');
  const commandArgs = npmCliPath
    ? [npmCliPath, ...args]
    : (process.platform === 'win32' ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args);
  const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit' });
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
