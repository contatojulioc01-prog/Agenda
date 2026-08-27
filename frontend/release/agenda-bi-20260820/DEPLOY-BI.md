# Implantação no servidor do BI

## Conteúdo do pacote

- `frontend/`: arquivos estáticos compilados do Angular.
- `backend/`: API Node, rotas, scripts e o SQLite antigo para importação única.
- `.env.example`: modelo de configuração, sem senhas reais.

## Backend

Crie o `.env` na raiz do pacote, preencha PostgreSQL, conta administrativa e `PORTAL_API`. Depois:

```powershell
Set-Location backend
npm ci --omit=dev
npm run db:setup
npm run db:migrate:sqlite
node index.js
```

Execute `db:migrate:sqlite` apenas para levar o histórico atual. Nas próximas atualizações, não é necessário repeti-lo.

Mantenha o backend como serviço do sistema (NSSM, PM2 ou serviço equivalente) e não exponha diretamente a porta 9900 para a internet.

## Frontend e proxy reverso

Publique o conteúdo de `frontend/` no servidor web. Configure fallback de SPA para `index.html` e encaminhe no mesmo domínio:

- `/api/*` para `http://127.0.0.1:9900/api/*`
- `/health` para `http://127.0.0.1:9900/health`
- `/ws` para `http://127.0.0.1:9900`, com Upgrade/Connection de WebSocket

Se o site usar HTTPS, o proxy precisa aceitar WebSocket seguro (`wss`). O frontend já escolhe `ws` ou `wss` automaticamente.

## PostgreSQL

O PostgreSQL pode estar no mesmo servidor ou em outro host. Libere a porta 5432 somente entre o backend e o servidor PostgreSQL. Não publique essa porta para os usuários do sistema.

## Verificação

Após iniciar o backend, abra `/health` pelo endereço público. A resposta deve conter `"status":"ok"`. Depois teste login, criação de agenda, evento e tarefa com prazo.
