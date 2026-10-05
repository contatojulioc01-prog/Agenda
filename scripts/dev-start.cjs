const { spawn } = require('node:child_process');

const isWindows = process.platform === 'win32';
const npmCommand = 'npm';
const token = 'agenda-dev-local';
const appHost = process.env.DEV_HOST || '0.0.0.0';
const appUrl = `http://0.0.0.0:9990/?token=${encodeURIComponent(token)}`;
const children = [];
let stopping = false;

function start(name, args, env) {
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : npmCommand;
  const commandArgs = isWindows ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args;
  const child = spawn(command, commandArgs, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: 'inherit',
    windowsHide: true,
  });
  child.on('exit', code => {
    if (!stopping && code !== 0) {
      console.error(`[DEV] ${name} encerrou com código ${code}.`);
      stop(code || 1);
    }
  });
  children.push(child);
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 500).unref();
}

async function waitUntilReady(url, attempts = 90) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch { }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

function openBrowser(url) {
  if (process.argv.includes('--no-open')) return;
  const command = isWindows ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = isWindows ? ['/c', 'start', '', url] : [url];
  const opener = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  opener.unref();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

const devDb = process.env.PGDATABASE || 'agenda_dev';
console.log('[DEV] Iniciando Agenda sem autenticação SSO externa...');
console.log('[DEV] O bypass só funciona em 0.0.0.0 e não é habilitado em produção.');
console.log(`[DEV] Banco de dados: ${devDb}`);

start('backend', ['--prefix', 'backend', 'start'], {
  NODE_ENV: 'development',
  DEV_AUTH_BYPASS: 'true',
  DEV_AUTH_TOKEN: token,
  HOST: appHost,
  PORT: '9900',
  PGDATABASE: devDb,
});
start('frontend', ['--prefix', 'frontend', 'run', 'dev'], {});

Promise.all([
  waitUntilReady('http://0.0.0.0:9900/health'),
  waitUntilReady('http://0.0.0.0:9990/'),
]).then(([backendReady, frontendReady]) => {
  if (!backendReady || !frontendReady) {
    console.error('[DEV] Os servidores não ficaram prontos dentro do tempo esperado.');
    stop(1);
    return;
  }
  console.log(`\n[DEV] Pronto: ${appUrl}`);
  console.log('[DEV] Pressione Ctrl+C para encerrar os dois servidores.\n');
  openBrowser(appUrl);
});
