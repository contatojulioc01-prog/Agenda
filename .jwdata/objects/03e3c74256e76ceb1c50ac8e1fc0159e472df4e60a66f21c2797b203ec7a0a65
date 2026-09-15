const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const outputPdf = path.join(__dirname, '..', '..', 'RELATORIO_SEGURANCA_DEVSECOPS.pdf');
const tempHtml = path.join(__dirname, '..', '..', 'relatorio_temp.html');

const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Resumo de Segurança da Aplicação - Agenda Corporativa</title>
  <style>
    @page {
      size: A4;
      margin: 16mm 14mm 16mm 14mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      background-color: #ffffff;
      font-size: 12.5px;
      line-height: 1.55;
    }
    .page-break {
      page-break-before: always;
    }
    .avoid-break {
      page-break-inside: avoid;
    }
    
    /* Capa / Header */
    .header-banner {
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
      color: #ffffff;
      padding: 22px;
      border-radius: 8px;
      margin-bottom: 20px;
      border-left: 6px solid #4f46e5;
    }
    .header-banner h1 {
      font-size: 21px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 6px;
      color: #ffffff;
    }
    .header-banner .subtitle {
      font-size: 12.5px;
      color: #cbd5e1;
      margin-bottom: 12px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
      font-size: 11px;
    }
    .meta-item strong {
      display: block;
      color: #94a3b8;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }

    h2 {
      font-size: 15.5px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 20px;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 2px solid #e2e8f0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    h3 {
      font-size: 13px;
      font-weight: 600;
      color: #1e293b;
      margin-top: 12px;
      margin-bottom: 6px;
    }

    p {
      margin-bottom: 8px;
      color: #334155;
    }
    ul, ol {
      margin-bottom: 10px;
      padding-left: 20px;
      color: #334155;
    }
    li {
      margin-bottom: 4px;
    }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .badge-critical { background-color: #fee2e2; color: #991b1b; border: 1px solid #f87171; }
    .badge-high { background-color: #ffedd5; color: #9a3412; border: 1px solid #fb923c; }
    .badge-medium { background-color: #fef9c3; color: #854d0e; border: 1px solid #facc15; }
    .badge-low { background-color: #dcfce7; color: #166534; border: 1px solid #4ade80; }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 16px 0;
      font-size: 11px;
    }
    th, td {
      padding: 7px 9px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    th {
      background-color: #f8fafc;
      color: #475569;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 9.5px;
      letter-spacing: 0.5px;
    }
    tr:nth-child(even) td {
      background-color: #fcfcfd;
    }

    /* Cards */
    .vuln-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 10px;
      background-color: #ffffff;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .vuln-card.critical { border-left: 4px solid #ef4444; }
    .vuln-card.high { border-left: 4px solid #f97316; }
    .vuln-card.medium { border-left: 4px solid #eab308; }
    .vuln-card.low { border-left: 4px solid #22c55e; }

    .vuln-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .vuln-title {
      font-size: 12.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .location-tag {
      font-family: monospace;
      font-size: 10.5px;
      color: #475569;
      background-color: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      margin-bottom: 5px;
      display: inline-block;
    }

    /* Code Blocks */
    pre, code {
      font-family: Consolas, Monaco, "Courier New", monospace;
    }
    code {
      background-color: #f1f5f9;
      color: #0f172a;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 10.5px;
    }
    pre {
      background-color: #0f172a;
      color: #f8fafc;
      padding: 9px 11px;
      border-radius: 5px;
      font-size: 10.5px;
      overflow-x: auto;
      margin: 6px 0;
      line-height: 1.35;
    }

    .callout {
      background-color: #eff6ff;
      border-left: 4px solid #3b82f6;
      padding: 9px 11px;
      border-radius: 0 6px 6px 0;
      margin: 10px 0;
      font-size: 11.5px;
    }
    .callout-warning {
      background-color: #fffbeb;
      border-left: 4px solid #f59e0b;
      padding: 9px 11px;
      border-radius: 0 6px 6px 0;
      margin: 10px 0;
      font-size: 11.5px;
    }
  </style>
</head>
<body>

  <!-- BANNER EXECUTIVO -->
  <div class="header-banner">
    <h1>Relatório de Auditoria de Segurança & DevSecOps</h1>
    <div class="subtitle">Análise de Código-Fonte, Superfície de Ataque e Hardening — Projeto Agenda Corporativa</div>
    <div class="meta-grid">
      <div class="meta-item">
        <strong>Aplicação</strong>
        Agenda Corporativa (Node.js & Angular)
      </div>
      <div class="meta-item">
        <strong>Escopo</strong>
        API Express, PostgreSQL, WebSockets
      </div>
      <div class="meta-item">
        <strong>Padrão de Avaliação</strong>
        OWASP Top 10 / DevSecOps
      </div>
      <div class="meta-item">
        <strong>Classificação</strong>
        Uso Interno / Confidencial
      </div>
    </div>
  </div>

  <!-- 1. MATRIZ RÁPIDA DE PRIORIDADE -->
  <div class="avoid-break">
    <h2>1. Matriz de Prioridade e Classificação de Riscos</h2>
    <p>Resumo executivo das vulnerabilidades e riscos identificados no ecossistema da aplicação:</p>
    
    <table>
      <thead>
        <tr>
          <th style="width: 13%;">Prioridade</th>
          <th style="width: 27%;">Vulnerabilidade / Ponto de Atenção</th>
          <th style="width: 30%;">Localização no Código</th>
          <th style="width: 30%;">Impacto e Superfície</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="badge badge-critical">Crítico</span></td>
          <td><strong>WebSocket & SSE Sem Autenticação</strong></td>
          <td><code>backend/index.js</code> (WS & /api/realtime)</td>
          <td>Vazamento de todos os eventos da aplicação em tempo real.</td>
        </tr>
        <tr>
          <td><span class="badge badge-critical">Crítico</span></td>
          <td><strong>Credenciais Expostas no Repositório</strong></td>
          <td><code>backend/.env</code> & <code>.env.example</code></td>
          <td>Acesso direto e irrestrito ao banco de dados PostgreSQL.</td>
        </tr>
        <tr>
          <td><span class="badge badge-high">Alto</span></td>
          <td><strong>Proxy de Usuários sem Autenticação</strong></td>
          <td><code>backend/index.js</code> (/api/users/all)</td>
          <td>Enumeração e extração da lista de colaboradores.</td>
        </tr>
        <tr>
          <td><span class="badge badge-high">Alto</span></td>
          <td><strong>Broadcast Global Inseguro (Multi-Tenant)</strong></td>
          <td><code>backend/index.js</code> (broadcast())</td>
          <td>Notificações enviadas a clientes sem validar permissão da agenda.</td>
        </tr>
        <tr>
          <td><span class="badge badge-high">Alto</span></td>
          <td><strong>Risco de DoS em Upload de Anexos</strong></td>
          <td><code>backend/routes/attachments.js</code></td>
          <td>Processamento síncrono em Buffer de 10MB que pode esgotar memória RAM.</td>
        </tr>
        <tr>
          <td><span class="badge badge-medium">Médio</span></td>
          <td><strong>CORS Irrestrito (Wildcard: origin: '*')</strong></td>
          <td><code>backend/index.js</code> (cors)</td>
          <td>Permite requisições de origens não confiáveis via browser.</td>
        </tr>
        <tr>
          <td><span class="badge badge-medium">Médio</span></td>
          <td><strong>Ausência de Rate Limiting</strong></td>
          <td>Endpoints REST / Autenticação</td>
          <td>Vulnerável a ataques de força bruta e DoS na API corporativa.</td>
        </tr>
        <tr>
          <td><span class="badge badge-medium">Médio</span></td>
          <td><strong>Tráfego do Banco sem TLS (PGSSL=false)</strong></td>
          <td><code>backend/db.js</code> & <code>.env</code></td>
          <td>Tráfego SQL legível na rede interna (risco de Man-in-the-Middle).</td>
        </tr>
        <tr>
          <td><span class="badge badge-low">Baixo</span></td>
          <td><strong>Regex Inválida no Header Authorization</strong></td>
          <td><code>backend/routes/notifications.js:58</code></td>
          <td>Falha ao processar tokens enviados no formato <code>Bearer &lt;token&gt;</code>.</td>
        </tr>
        <tr>
          <td><span class="badge badge-low">Baixo</span></td>
          <td><strong>Ausência de Security Headers (Helmet/CSP)</strong></td>
          <td><code>backend/index.js</code></td>
          <td>Falta de proteção nativa contra Clickjacking e MIME Sniffing.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- 2. SUPERFÍCIE DE ATAQUE E RISCOS (OWASP TOP 10) -->
  <h2>2. Superfície de Ataque e Riscos (OWASP Top 10)</h2>

  <div class="vuln-card critical avoid-break">
    <div class="vuln-header">
      <span class="vuln-title">A01:2021 — Broken Access Control: WebSocket e SSE Não Autenticados</span>
      <span class="badge badge-critical">Crítico</span>
    </div>
    <div class="location-tag">backend/index.js (Linhas 39-68 e 84-98)</div>
    <p><strong>Causa Raiz:</strong> O handshake do WebSocket e a rota <code>GET /api/realtime</code> (Server-Sent Events) não validam o token Bearer via <code>authenticateAgendaRequest</code>. Além disso, a função <code>broadcast(data)</code> itera sobre <code>wss.clients</code> e <code>realtimeClients</code> sem filtrar o destinatário por permissão de agenda ou quadro.</p>
    <p><strong>Impacto:</strong> Qualquer agente conectado na rede local pode receber notificações de criação de eventos corporativos, alterações de tarefas e movimentações confidenciais de membros.</p>
  </div>

  <div class="vuln-card high avoid-break">
    <div class="vuln-header">
      <span class="vuln-title">A01 / A07 — Proxy de Usuários sem Barreira de Autenticação</span>
      <span class="badge badge-high">Alto</span>
    </div>
    <div class="location-tag">backend/index.js (Linhas 181-182)</div>
    <p><strong>Causa Raiz:</strong> As rotas <code>/api/users/all</code> e <code>/api/users</code> não incluem o middleware <code>authenticateAgendaRequest</code>. Se o Portal corporativo responder à requisição sem token ou possuir endpoints públicos, a lista de usuários é exposta a acessos anônimos.</p>
  </div>

  <div class="vuln-card high avoid-break">
    <div class="vuln-header">
      <span class="vuln-title">A04:2021 — Insecure Design: Sobrecarga de Memória por Anexos (DoS)</span>
      <span class="badge badge-high">Alto</span>
    </div>
    <div class="location-tag">backend/routes/attachments.js (Linhas 59-77)</div>
    <p><strong>Causa Raiz:</strong> A API utiliza <code>express.raw({ limit: '10mb' })</code> e grava o <code>Buffer</code> binário diretamente em coluna <code>BYTEA</code> do PostgreSQL. Requisições simultâneas de upload alocam múltiplos buffers de 10 MB diretamente no heap do Node.js, podendo provocar crash por <em>Out Of Memory (OOM)</em>.</p>
  </div>

  <div class="page-break"></div>

  <!-- 3. GESTÃO DE SEGREDOS E DADOS SENSÍVEIS -->
  <h2>3. Gestão de Segredos e Proteção de Dados Sensíveis</h2>

  <div class="vuln-card critical avoid-break">
    <div class="vuln-header">
      <span class="vuln-title">A02:2021 — Cryptographic Failures: Senhas em Texto Claro no Git</span>
      <span class="badge badge-critical">Crítico</span>
    </div>
    <div class="location-tag">backend/.env e backend/.env.example</div>
    <p><strong>Diagnóstico:</strong> O arquivo <code>.env</code> está presente no versionamento com credenciais de superusuário do banco (<code>PGPASSWORD=criancafeliz123</code>, <code>PGADMINPASSWORD=criancafeliz123</code>).</p>
    <p><strong>Ação Obrigatória:</strong> Incluir <code>.env</code> no <code>.gitignore</code>, rotacionar imediatamente as credenciais no PostgreSQL e adotar injeção via variáveis de ambiente de deploy ou gerenciador de segredos.</p>
  </div>

  <div class="vuln-card medium avoid-break">
    <div class="vuln-header">
      <span class="vuln-title">Comunicação com o Banco de Dados sem Criptografia (PGSSL=false)</span>
      <span class="badge badge-medium">Médio</span>
    </div>
    <div class="location-tag">backend/db.js (Linha 6) & backend/.env</div>
    <p><strong>Diagnóstico:</strong> Por padrão, o driver <code>pg</code> se conecta com <code>ssl: false</code>. Todos os dados trafegados entre o Node.js e o PostgreSQL (eventos, anexos, usuários) trafegam em texto claro na rede local.</p>
  </div>

  <!-- 4. CONTROLE DE ACESSO E AUTENTICAÇÃO -->
  <h2>4. Avaliação de Controle de Acesso (RBAC) e Sessões</h2>
  
  <div class="callout avoid-break">
    <strong>Pontos Fortes da Arquitetura Atual:</strong>
    <ul style="margin-top: 5px; margin-bottom: 0;">
      <li>O middleware <code>authenticateAgendaRequest</code> valida a autenticidade do token Bearer diretamente na API do Portal Corporativo (<code>/api/auth/me</code>).</li>
      <li><strong>Proteção Anti-Spoofing:</strong> O backend força <code>req.headers['x-user-id'] = cached.userId</code>, impedindo que usuários forjem identidades via cabeçalhos arbitrários.</li>
      <li>As rotas de Agendas, Eventos e Kanban realizam validação rigorosa de permissões (<code>owner</code>, <code>editor</code>, <code>admin</code>, <code>viewer</code>) a nível de banco de dados antes de executar mutações.</li>
    </ul>
  </div>

  <div class="vuln-card low avoid-break">
    <div class="vuln-header">
      <span class="vuln-title">Falha de Regex na Autenticação de Dispositivos de Notificação</span>
      <span class="badge badge-low">Baixo</span>
    </div>
    <div class="location-tag">backend/routes/notifications.js (Linha 58)</div>
    <p><strong>Diagnóstico:</strong> O código possui escape duplo indevido em regex literal: <code>authorization.replace(/^Bearer\\\\s+/i, '')</code>. No motor V8, isso não casa com o espaço após a palavra "Bearer", impedindo a autenticação correta via header Authorization padrão.</p>
  </div>

  <!-- 5. SUGESTÕES PRÁTICAS DE MITIGAÇÃO -->
  <h2>5. Sugestões Práticas de Mitigação (Código e Infra)</h2>

  <div class="avoid-break">
    <h3>1. Autenticação e Scoping no WebSocket e SSE</h3>
    <pre><code>// backend/index.js
// 1. Validar token no handshake do WebSocket
wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  if (!token) return ws.close(4001, 'Token ausente');

  const userId = await validateUserToken(token);
  if (!userId) return ws.close(4003, 'Sessão inválida');

  ws.userId = userId;
});

// 2. Proteger SSE e Proxy de Usuarios
app.get('/api/realtime', authenticateAgendaRequest, handleRealtimeSSE);
app.get('/api/users/all', authenticateAgendaRequest, handleUsersProxy);
app.get('/api/users', authenticateAgendaRequest, handleUsersProxy);</code></pre>
  </div>

  <div class="avoid-break">
    <h3>2. Endurecimento de Headers HTTP e Rate Limiting</h3>
    <pre><code>// backend/index.js
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Headers de seguranca contra Clickjacking e sniffing
app.use(helmet({ contentSecurityPolicy: false }));

// Rate limit geral para prevencao de forca bruta / DoS
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Limite de requisições atingido. Tente novamente mais tarde.' }
}));</code></pre>
  </div>

  <div class="avoid-break">
    <h3>3. Correção de Regex em Notificações</h3>
    <pre><code>// backend/routes/notifications.js - Linha 58
// Substituir '\\\\s+' por '\\s+' na regex literal:
const deviceKey = String(
  req.headers['x-device-key'] || 
  req.headers['x-device-token'] || 
  authorization.replace(/^Bearer\\s+/i, '')
).trim();</code></pre>
  </div>

  <div class="callout-warning avoid-break">
    <strong>Checklist DevSecOps para Produção:</strong>
    <ol style="margin-top: 5px; margin-bottom: 0;">
      <li>Adicionar <code>.env</code> ao <code>.gitignore</code> e rotacionar as senhas do PostgreSQL.</li>
      <li>Ativar <code>PGSSL=true</code> e restringir o CORS para as URLs exatas de produção (ex: <code>http://docebrinquedo.local</code>).</li>
      <li>Implementar verificação de hash (SRI) no build Angular e análise estática SAST contínua no CI/CD.</li>
    </ol>
  </div>

</body>
</html>
`;

fs.writeFileSync(tempHtml, htmlContent, 'utf-8');

const edgePaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

const browserExe = edgePaths.find(p => fs.existsSync(p));

if (!browserExe) {
  console.error('Nenhum navegador encontrado.');
  process.exit(1);
}

try {
  execFileSync(browserExe, [
    '--headless',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${outputPdf}`,
    tempHtml
  ]);

  if (fs.existsSync(outputPdf)) {
    const stats = fs.statSync(outputPdf);
    console.log(`[SUCESSO] PDF gerado: ${outputPdf} (${(stats.size / 1024).toFixed(2)} KB)`);
  }
} catch (err) {
  console.error('[ERRO] Falha ao gerar PDF:', err.message);
} finally {
  if (fs.existsSync(tempHtml)) {
    fs.unlinkSync(tempHtml);
  }
}

