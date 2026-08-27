# Agenda Corporativa Compartilhada

Aplicação web completa para gerenciamento de agendas, eventos e calendários corporativos compartilhados, desenvolvida com **Angular** no frontend e **Node.js / Express / SQLite** no backend.

---

## 🚀 Tecnologias Utilizadas

### Frontend

- **Angular 22** (Standalone Components, Signals & Router)
- **Angular Material & CDK** (Componentes de UI e Acessibilidade)
- **RxJS** (Programação Reativa)
- **TypeScript & SCSS**

### Backend

- **Node.js & Express** (API RESTful)
- **SQLite (`sql.js`)** (Banco de dados leve em memória/arquivo)
- **WebSockets (`ws`)** (Atualizações em tempo real)
- **CORS**

---

## 📁 Estrutura do Projeto

```text
agenda/
├── backend/                # Servidor API Node.js/Express
│   ├── db.js               # Conexão e inicialização do banco SQLite
│   ├── index.js            # Ponto de entrada do servidor Express e WebSocket
│   ├── routes/             # Rotas de Calendários, Eventos e Membros
│   └── agenda.db           # Arquivo do banco de dados SQLite
├── src/                    # Código-fonte da aplicação Frontend Angular
│   ├── app/
│   │   ├── core/           # Modelos, serviços e guardas centrais
│   │   ├── features/       # Módulos de funcionalidades (Auth, Calendar, etc.)
│   │   └── shared/         # Componentes e pipes compartilhados
│   ├── assets/             # Recursos estáticos
│   └── styles.scss         # Estilos globais
├── angular.json            # Configurações do Angular CLI
└── package.json            # Dependências e scripts do projeto
```

---

## 🛠️ Como Executar o Projeto

### Pré-requisitos

- **Node.js** (versão 18+ recomendada)
- **npm** (incluso com o Node.js)

---

### 1. Instalação das Dependências

Instale as dependências da raiz (Frontend) e do Backend:

```bash
# Dependências do Frontend
npm install

# Dependências do Backend
cd backend
npm install
cd ..
```

---

### 2. Executando o Backend

Para iniciar a API do servidor e conexões WebSocket:

```bash
npm run backend
```

> O backend estará rodando por padrão em `http://localhost:3000` (ou na porta configurada).

---

### 3. Executando o Frontend (Angular)

Para iniciar o servidor de desenvolvimento do Angular:

```bash
npm start
```

> O frontend estará acessível em **`http://localhost:9990/`** (ou `http://localhost:4200/` conforme configuração).

> 💡 **Nota para resolução de problemas com a CLI do Angular:**
> Se ao tentar executar `ng serve` diretamente você receber um erro como:
> `ng : O termo 'ng' não é reconhecido...`
>
> Isso significa que o Angular CLI não está instalado globalmente nas variáveis de ambiente da sua máquina. Para resolver:
>
> - Use sempre **`npm start`** ou **`npm run build`** (que executam os scripts locais salvos no `package.json`).
> - Ou use o `npx`: **`npx ng serve`**.

---

## 📜 Scripts Disponíveis

Na raiz do projeto (`package.json`), você pode executar:

| Comando             | Descrição                                                                           |
| :------------------ | :------------------------------------------------------------------------------------ |
| `npm start`       | Inicia o servidor Angular em modo de desenvolvimento (porta 9990 com host`0.0.0.0`) |
| `npm run backend` | Executa o servidor backend Node.js (`node backend/index.js`)                        |
| `npm run build`   | Compila o projeto frontend para produção na pasta`dist/`                          |
| `npm run watch`   | Compila a aplicação continuamente em ambiente de desenvolvimento                    |
| `npm run test`    | Executa os testes unitários da aplicação Angular                                   |

---

## 📡 Endpoints da API (Backend)

- **`GET /api/calendars`** — Lista os calendários disponíveis
- **`GET /api/events`** — Lista todos os eventos cadastrados
- **`POST /api/events`** — Cria um novo evento
- **`PUT /api/events/:id`** — Atualiza um evento existente
- **`DELETE /api/events/:id`** — Remove um evento
- **`GET /api/members`** — Lista os membros da equipe

---

## 📄 Licença

Este projeto é de uso interno/educacional.
