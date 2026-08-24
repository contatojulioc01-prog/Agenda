# PostgreSQL da Agenda

O backend usa PostgreSQL como banco operacional. O arquivo `backend/agenda.db` não é mais aberto pela aplicação; ele permanece disponível apenas para importar os dados antigos.

## 1. Configurar a conexão

Instale as dependências do backend:

```powershell
npm run backend:install
```

Copie `.env.example` para `.env` e informe o endereço do PostgreSQL que já roda no servidor do BI:

```powershell
Copy-Item .env.example .env
```

Preencha principalmente `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` e `PGPASSWORD`. Se o PostgreSQL exigir TLS, use `PGSSL=true`.

## 2. Criar o usuário, database e tabelas

Com uma conta administrativa preenchida em `PGADMINUSER` e `PGADMINPASSWORD`, execute:

```powershell
npm run db:setup
```

O comando cria somente o usuário/database configurado e depois aplica todas as tabelas e índices da Agenda. Ele não altera os outros bancos do servidor.

Se preferir executar pelo pgAdmin ou `psql`, use uma conta administrativa:

```sql
CREATE ROLE agenda_app LOGIN PASSWORD 'SUA_SENHA_FORTE';
CREATE DATABASE agenda OWNER agenda_app ENCODING 'UTF8';
```

Depois execute `npm run db:setup` para criar as tabelas.

## 3. Importar os dados existentes do SQLite

Faça backup de `backend/agenda.db` e execute uma vez:

```powershell
npm run db:migrate:sqlite
```

A importação usa `ON CONFLICT DO NOTHING`, portanto pode ser repetida sem duplicar IDs já importados.

## 4. Iniciar

```powershell
npm run backend
npm start
```

Libere a porta `5432` no firewall apenas entre o computador da aplicação e o servidor PostgreSQL. Evite expor a porta publicamente.
