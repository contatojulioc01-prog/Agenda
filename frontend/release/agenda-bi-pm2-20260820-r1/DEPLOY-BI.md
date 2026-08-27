# Implantacao no BI com PM2

O pacote roda frontend Angular, API e WebSocket no mesmo processo Node. O servidor
escuta em `0.0.0.0:9900` e e acessado na rede por `http://192.168.13.244:9900`.

## Primeira instalacao

No PowerShell do BI, extraia o ZIP e entre na pasta criada. Depois:

```powershell
Copy-Item .env.example .env
notepad .env
Set-Location backend
npm ci --omit=dev
npm run db:setup
npm run db:migrate:sqlite
Set-Location ..
npm install --global pm2
pm2 start ecosystem.config.js --env production
pm2 save
```

Preencha o `.env` antes de executar os comandos de banco. Rode
`db:migrate:sqlite` somente na primeira implantacao, caso queira importar os dados
do SQLite antigo. O `db:setup` pode ser repetido com seguranca.

## Atualizacoes seguintes

Substitua os arquivos da aplicacao, preserve o `.env` do servidor e execute:

```powershell
Set-Location backend
npm ci --omit=dev
Set-Location ..
pm2 restart agenda-bi --update-env
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
