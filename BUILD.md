# Build e estrutura do projeto

O projeto possui o codigo-fonte separado em `frontend` e `backend`. O build de
producao do Angular e gerado diretamente em `backend/public`, permitindo que um
unico processo Node entregue o frontend, a API REST e as conexoes em tempo real.

## Estrutura

```text
agenda/
|-- frontend/                  # Codigo-fonte Angular
|   |-- public/                # Arquivos estaticos copiados pelo Angular
|   |-- src/                   # Aplicacao Angular
|   |-- angular.json           # Configuracao; saida em ../backend/public
|   `-- package.json
|-- backend/                   # Aplicacao Node.js/Express
|   |-- public/                # Frontend compilado (gerado pelo build)
|   |-- routes/                # Rotas da API
|   |-- scripts/               # Scripts de banco de dados
|   |-- index.js               # API, WebSocket e servidor do frontend
|   `-- package.json
|-- package.json               # Comandos unificados: npm start/build/test
|-- production-start.js        # Inicializador de producao
`-- BUILD.md                   # Este documento
```

`backend/public` e uma saida gerada. Nao edite seus arquivos manualmente: altere
o codigo em `frontend/src` ou os recursos em `frontend/public` e gere o build
novamente.

## Pre-requisitos

- Node.js 22 ou superior;
- npm;
- dependencias instaladas no frontend e no backend.

Na raiz do repositorio, instale as dependencias quando necessario:

```powershell
npm --prefix frontend ci
npm --prefix backend ci
```

## Gerar o build

O comando pode ser executado de duas formas equivalentes a partir da raiz:

```powershell
npm --prefix frontend run build
```

ou pelo script do backend:

```powershell
npm --prefix backend run build
```

O Angular limpa a saida anterior e grava o novo frontend diretamente em:

```text
backend/public/
```

Ao final, confirme pelo menos os seguintes arquivos:

```powershell
Test-Path backend/public/index.html
Get-ChildItem backend/public/main-*.js
Get-ChildItem backend/public/styles-*.css
```

O build de producao preserva `<base href="/agenda/">`, pois a aplicacao e
publicada no IIS sob `http://docebrinquedo.local/agenda/`. O proxy do IIS remove
esse prefixo antes de encaminhar a requisicao ao Node.

## Executar em producao

Depois do build, entre na raiz do projeto e execute somente:

```powershell
npm start
```

O script da raiz chama `production-start.js`. Na primeira execucao, ele instala
automaticamente as dependencias de producao do backend caso ainda nao existam.
Depois, verifica se `backend/public/index.html` foi gerado e inicia o Express.
Por padrao, o servidor escuta em `0.0.0.0:9900`; as rotas da API permanecem em
`/api`, o health check em `/health` e o canal em tempo real usa WebSocket/SSE.

## Desenvolvimento

Durante o desenvolvimento, execute frontend e backend separadamente:

```powershell
npm --prefix backend run dev
npm --prefix frontend run dev
```

O Angular roda na porta `9990` e encaminha as requisicoes configuradas em
`frontend/proxy.conf.json` para o backend na porta `9900`. Nao e necessario gerar
`backend/public` a cada alteracao durante esse fluxo.
