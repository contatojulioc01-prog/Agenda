# Implantacao no BI com PM2

O pacote roda frontend Angular, API e WebSocket no mesmo processo Node. O servidor
escuta em `0.0.0.0:9900` e e acessado na rede por `http://192.168.13.244:9900`.

## Inicio simplificado

O pacote completo inclui o `.env` ja configurado para este ambiente. Ao atualizar,
preserve esse arquivo e nunca o publique fora do servidor. Depois de extrair:

```powershell
npm start
```

O `npm start` instala automaticamente as dependencias do backend na primeira
execucao e inicia frontend, API e WebSocket juntos em `0.0.0.0:9900`. A estrutura
das tabelas e criada automaticamente pela aplicacao.

Para importar o SQLite antigo, opcionalmente execute uma unica vez:

```powershell
Set-Location backend
npm run db:migrate:sqlite
Set-Location ..
```

## Atualizacoes seguintes

Substitua os arquivos da aplicacao, preserve o `.env` do servidor e execute:

```powershell
npm start
```

## PM2 opcional

Se a aplicacao precisar ficar em segundo plano e reiniciar automaticamente:

```powershell
npm install --global pm2
pm2 start ecosystem.config.js --env production
pm2 save
```

## Operacao

```powershell
pm2 status
pm2 logs agenda-bi
pm2 restart agenda-bi --update-env
pm2 stop agenda-bi
```

O PM2 usa apenas uma instancia em modo `fork`, pois as conexoes WebSocket sao
mantidas no processo. Para iniciar automaticamente apos reiniciar um servidor
Linux, execute `pm2 startup` e siga o comando mostrado, depois `pm2 save`. Em
Windows, configure o PM2 no Agendador de Tarefas ou como servico conforme o padrao
de infraestrutura do servidor.

## Rede e verificacao

Libere a porta TCP 9900 no firewall do BI para a rede interna. A porta 5432 do
PostgreSQL deve ficar acessivel apenas entre a aplicacao e o banco.

Teste no proprio BI e em outra maquina da rede:

```powershell
Invoke-RestMethod http://127.0.0.1:9900/health
Invoke-RestMethod http://192.168.13.244:9900/health
```

A resposta deve conter `"status": "ok"`. Depois abra
`http://192.168.13.244:9900` no navegador.
