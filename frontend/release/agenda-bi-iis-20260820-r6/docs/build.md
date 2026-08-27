# Build e implantacao da Agenda

Este documento descreve o processo utilizado para gerar o pacote de producao da
Agenda, publicar no servidor do BI e disponibilizar o sistema pelo IIS em
`http://docebrinquedo.local/agenda/`.

## Arquitetura do pacote

Em producao existe apenas um processo Node:

- o frontend Angular compilado fica em `frontend/`;
- a API REST fica em `/api`;
- o health check fica em `/health`;
- o WebSocket fica em `/ws`;
- o PostgreSQL armazena os dados;
- o servidor Node escuta em `0.0.0.0:9900`;
- o IIS publica tudo externamente pelo subcaminho `/agenda/`.

O arquivo `production-start.js` permite iniciar o pacote apenas com `npm start`.
Na primeira execucao ele detecta a ausencia de `backend/node_modules` e executa
automaticamente `npm ci --omit=dev` dentro de `backend`.

## Pre-requisitos da maquina de build

- Windows com PowerShell;
- Node.js 22 ou superior;
- npm;
- dependencias do projeto instaladas na raiz;
- arquivo `.env` configurado quando ele precisar fazer parte do pacote interno.

Na raiz do projeto:

```powershell
Set-Location D:\garotodeprograma\agenda
npm ci
```

## Configuracao importante para o IIS

O build de producao usa o seguinte `baseHref` em `angular.json`:

```json
"baseHref": "/agenda/"
```

Por isso, imagens e outros arquivos locais devem usar caminhos relativos:

```html
<img src="sidebar.png">
```

Nao use caminhos iniciados por `/`, como `src="/sidebar.png"`, porque eles
apontariam para a raiz de `docebrinquedo.local`, fora de `/agenda/`.

O interceptor HTTP adiciona `/agenda` nas requisicoes locais `/api` e `/health`.
O servico de sincronizacao monta o WebSocket como `/agenda/ws` e seleciona `ws`
ou `wss` conforme o protocolo da pagina.

## 1. Validar o codigo Node

Antes do build, valide os pontos de entrada:

```powershell
node --check production-start.js
node --check ecosystem.config.js
node --check backend\index.js
node --check backend\db.js
```

Para validar todos os arquivos JavaScript do backend:

```powershell
Get-ChildItem backend -Filter '*.js' -Recurse |
  Where-Object { $_.FullName -notlike '*\node_modules\*' } |
  ForEach-Object { node --check $_.FullName }
```

## 2. Compilar o Angular

Execute na raiz:

```powershell
npm run build
```

A saida deve ser criada em:

```text
dist\agenda\browser
```

Confirme o subcaminho do IIS e os arquivos essenciais:

```powershell
Select-String -Path dist\agenda\browser\index.html -Pattern '<base href="/agenda/">'
Test-Path dist\agenda\browser\main-*.js
Test-Path dist\agenda\browser\styles-*.css
Test-Path dist\agenda\browser\sidebar.png
```

Avisos de budget do Angular nao interrompem o build. Um erro ou codigo de saida
diferente de zero deve ser corrigido antes de empacotar.

## 3. Montar a pasta de release

Use um nome novo para cada release. O exemplo abaixo nao apaga nem sobrescreve
pacotes anteriores:

```powershell
Set-Location D:\garotodeprograma\agenda

$releaseName = 'agenda-bi-iis-AAAAMMDD-r1'
$releaseRoot = Join-Path (Get-Location) 'release'
$packagePath = Join-Path $releaseRoot $releaseName
$zipPath = Join-Path $releaseRoot ($releaseName + '.zip')

if ((Test-Path -LiteralPath $packagePath) -or (Test-Path -LiteralPath $zipPath)) {
  throw 'Escolha outro nome: a release ja existe.'
}

New-Item -ItemType Directory -Path $packagePath | Out-Null
New-Item -ItemType Directory -Path (Join-Path $packagePath 'frontend') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $packagePath 'backend') | Out-Null

Copy-Item -Path 'dist\agenda\browser\*' `
  -Destination (Join-Path $packagePath 'frontend') -Recurse

Copy-Item -LiteralPath `
  'backend\index.js', `
  'backend\db.js', `
  'backend\async-route.js', `
  'backend\package.json', `
  'backend\package-lock.json', `
  'backend\agenda.db' `
  -Destination (Join-Path $packagePath 'backend')

Copy-Item -LiteralPath 'backend\routes' `
  -Destination (Join-Path $packagePath 'backend') -Recurse

Copy-Item -LiteralPath 'backend\scripts' `
  -Destination (Join-Path $packagePath 'backend') -Recurse

Copy-Item -LiteralPath `
  '.env', `
  '.env.example', `
  'package.json', `
  'production-start.js', `
  'ecosystem.config.js', `
  'DEPLOY-BI.md', `
  'POSTGRESQL.md', `
  'IIS-AGENDA.config' `
  -Destination $packagePath
```

O `backend/agenda.db` e os scripts de migracao sao mantidos somente para uma
eventual importacao unica do SQLite antigo. A aplicacao operacional utiliza o
PostgreSQL.

### Seguranca do `.env`

O procedimento acima inclui o `.env` porque o pacote e destinado diretamente ao
servidor interno e deve manter a configuracao existente. Esse ZIP passa a conter
credenciais e nao pode ser enviado para repositorios, e-mail publico ou locais
sem controle de acesso.

Para gerar um pacote sem credenciais, remova `'.env'` da lista de `Copy-Item` e
configure o arquivo manualmente no BI a partir de `.env.example`.

## 4. Criar o ZIP

Depois de montar a pasta:

```powershell
tar -a -c -f $zipPath -C $releaseRoot $releaseName
```

O ZIP fica em `release\<nome-da-release>.zip`.

## 5. Validar o pacote

```powershell
$packageIndex = Join-Path $packagePath 'frontend\index.html'
$packageStart = Join-Path $packagePath 'production-start.js'
$packageBackend = Join-Path $packagePath 'backend\index.js'

if (-not (Select-String -Path $packageIndex -Pattern '<base href="/agenda/">' -Quiet)) {
  throw 'O base href /agenda/ nao foi encontrado.'
}

node --check $packageStart
node --check $packageBackend
tar -tf $zipPath | Select-Object -First 40
Get-FileHash $zipPath -Algorithm SHA256
Get-Item $zipPath | Select-Object FullName, Length, LastWriteTime
```

Confirme que existem no ZIP:

- `frontend/index.html`;
- `frontend/main-*.js`;
- `frontend/styles-*.css`;
- `frontend/sidebar.png`;
- `backend/index.js`;
- `backend/package.json` e `backend/package-lock.json`;
- `production-start.js`;
- `package.json`;
- `.env` ou `.env.example`, conforme o tipo de pacote;
- `IIS-AGENDA.config`.

`node_modules` nao deve ser empacotado. Ele e instalado automaticamente no BI na
primeira execucao.

## 6. Publicar no BI

Servidor:

```text
192.168.13.244
```

Diretorio usado no BI:

```text
C:\server\agenda
```

Pare a execucao anterior com `Ctrl+C`, copie o conteudo da nova release para o
diretorio e preserve o `.env` mais atualizado do servidor. Depois:

```cmd
cd C:\server\agenda
npm start
```

Na primeira execucao, o npm instala as dependencias do backend. Nas seguintes, o
inicio e direto. A aplicacao deve informar que esta ouvindo em `0.0.0.0:9900`.

Teste diretamente no BI:

```powershell
Invoke-RestMethod http://127.0.0.1:9900/health
Invoke-RestMethod http://192.168.13.244:9900/health
```

## 7. Configurar o proxy no IIS

Insira as regras de `IIS-AGENDA.config` dentro de:

```xml
<configuration>
  <system.webServer>
    <webSocket enabled="true" />
    <rewrite>
      <rules>
        <!-- regras da Agenda aqui -->
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

As regras utilizadas sao:

```xml
<rule name="Agenda - Barra final" stopProcessing="true">
  <match url="^agenda$" />
  <action type="Redirect" url="/agenda/" redirectType="Permanent" />
</rule>

<rule name="Agenda" stopProcessing="true">
  <match url="^agenda(?:/(.*))?$" />
  <action
    type="Rewrite"
    url="http://docebrinquedo.local:9900/{R:1}"
    appendQueryString="true"
  />
</rule>
```

Essas regras devem ficar antes de regras genericas ou catch-all do portal. O IIS
precisa ter URL Rewrite, ARR Proxy e WebSocket Protocol habilitados.

Teste a publicacao:

```text
http://docebrinquedo.local/agenda/
http://docebrinquedo.local/agenda/health
```

Depois de uma atualizacao do frontend, use `Ctrl+F5` no navegador para descartar
arquivos antigos do cache.

## PM2 opcional

O inicio manual oficial do pacote e `npm start`. Para manter a Agenda em segundo
plano pelo PM2:

```powershell
npm install --global pm2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 status
pm2 logs agenda-bi
```

O processo usa uma unica instancia em modo `fork`, pois as conexoes WebSocket sao
mantidas em memoria pelo processo Node.

## Problemas comuns

### `EADDRINUSE` na porta 9900

Ja existe outro processo usando a porta. Verifique antes de iniciar outra copia:

```powershell
Get-NetTCPConnection -LocalPort 9900 -ErrorAction SilentlyContinue
```

Se a Agenda ja estiver no PM2, reinicie o processo existente em vez de executar
uma segunda instancia.

### `client password must be a string`

O `.env` nao foi carregado ou as variaveis do PostgreSQL estao ausentes. Confirme
que `C:\server\agenda\.env` existe e contem `PGHOST`, `PGPORT`, `PGDATABASE`,
`PGUSER` e `PGPASSWORD`.

### Imagens ausentes em `/agenda/`

Procure caminhos absolutos iniciados por `/` no frontend. Recursos internos devem
ser relativos ao `base href`, por exemplo `sidebar.png`.

### Tela abre, mas API ou WebSocket nao conectam

Confirme:

- resposta de `/agenda/health`;
- ARR Proxy habilitado;
- WebSocket Protocol habilitado no IIS;
- porta 9900 acessivel localmente no BI;
- regra da Agenda posicionada antes das regras genericas do portal.
