const { execSync } = require('child_process');

function killPort(port, name) {
  try {
    const output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    const lines = output.trim().split('\n');
    const pids = new Set();

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && !isNaN(Number(pid))) {
        pids.add(pid);
      }
    }

    if (pids.size === 0) {
      console.log(`[OK] Nenhum processo ativo na porta ${port} (${name}).`);
      return;
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`[FECHADO] ${name} (PID: ${pid} na porta ${port}) encerrado com sucesso.`);
      } catch (err) {
        console.warn(`[AVISO] Nao foi possivel encerrar PID ${pid}: ${err.message}`);
      }
    }
  } catch {
    console.log(`[OK] Porta ${port} (${name}) ja esta livre.`);
  }
}

console.log('==============================================');
console.log('  Encerrando processos de Agenda Corporativa  ');
console.log('==============================================');

killPort(9990, 'Frontend Angular');
killPort(9900, 'Backend Node/Express');

console.log('----------------------------------------------');
console.log('[CONCLUIDO] Todos os servidores foram encerrados.');
console.log('==============================================\n');
