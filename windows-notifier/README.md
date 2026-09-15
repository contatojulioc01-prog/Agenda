# Agenda Notifier 4 para Windows

Aplicativo de bandeja para Windows 10/11, com .NET Framework 4.8 e Windows PowerShell 5.1. Consulta a Agenda a cada 60 segundos, mesmo com o navegador fechado.

## Instalar ou atualizar

1. Atualize o servidor com o backend e o frontend desta versão. Na inicialização, a migração adiciona `notification_preferences.task_days_before`, preservando as preferências existentes.
2. Execute `Agenda.Notifier.exe`, disponível em `frontend/public/downloads` e no botão **Baixar EXE** da Agenda.
3. Se já havia uma versão instalada, o atualizador encerra a cópia instalada nesse perfil e preserva a ativação. Em uma primeira instalação, abra **Notificações do Windows** na Agenda, gere o código `AGENDA1-` e cole no aplicativo.
4. Na tela web, escolha os lembretes e clique em **Salvar lembretes**.

Instalação por usuário em `%LOCALAPPDATA%\AgendaNotifier\Agenda.Notifier.v4.exe`, sem administrador. A chave fica protegida por DPAPI em `config.json`. O aplicativo conectado inicia automaticamente com o Windows. Erros de inicialização e envio ficam em `Agenda.Notifier.log`, nessa mesma pasta.

## Lembretes

- **Tarefas:** por padrão, lembrete às 08:30 a partir de um dia antes do prazo, diariamente até o vencimento. A antecedência aceita de 0 a 30 dias. Considera tarefas ativas, fora da lixeira, dos quadros acessíveis; tarefas atribuídas a outra pessoa são omitidas. Arquive tarefas finalizadas para retirá-las dos lembretes.
- **Agenda:** por padrão, 15 minutos antes do evento; aceita de 0 a 1440 minutos, inclusive quando o aviso cai no dia anterior. Eventos de dia inteiro usam o horário diário. Eventos encerrados são omitidos.
- Cada notificação nativa guarda seu próprio link, inclusive no histórico do Windows. Clicar abre a tarefa, subtarefa ou evento correspondente no navegador padrão, preservando o prefixo `/agenda`.
- Sem sessão no navegador, a tela de login preserva o destino para continuar após informar o ticket.
- O Windows controla a apresentação dos banners: as notificações da Agenda precisam estar habilitadas e o modo Não incomodar pode silenciá-las. A confirmação registra o envio ao Windows, não a leitura pelo usuário.

## Kanban transparente

No ícone da bandeja, escolha **Kanban na área de trabalho**.

- Selecione qualquer quadro pessoal ou de equipe acessível ao usuário conectado.
- Ajuste a **Opacidade** entre 30% e 100%; valor menor deixa o painel mais transparente.
- Arraste e redimensione o popup. Marque **Sempre à frente** para mantê-lo sobre outras janelas.
- Clique no cartão para abrir seus detalhes no navegador. A edição continua na aplicação web.
- A posição, o tamanho, a opacidade e o quadro selecionado são salvos. Fechar o popup o oculta; os lembretes continuam funcionando.
- O painel atualiza a cada consulta. Sem conexão, mantém os dados com indicação do erro. Ao detectar chave revogada, remove o conteúdo.

## Compilar e validar

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File windows-notifier/build.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File windows-notifier/test.ps1
# Opcional: envia uma notificação de teste, verifica o histórico e a remove.
powershell -NoProfile -ExecutionPolicy Bypass -File windows-notifier/test.ps1 -Toast
npm test
npm run build
node scripts/check_utf8.mjs
```

O build Angular copia o EXE para `backend/public/downloads`. Sempre compile o notificador antes do frontend. O executável usa os componentes citados do Windows e não contém certificado de assinatura digital.

O teste de navegador usa Playwright instalado separadamente e Chrome em modo headless, com API simulada:

```powershell
node scripts/test-notification-links.cjs C:/caminho/node_modules/playwright
```

Referências: [registro de notificações Win32 no toolkit da Microsoft](https://github.com/CommunityToolkit/WindowsCommunityToolkit/blob/main/Microsoft.Toolkit.Uwp.Notifications/Toasts/Compat/ToastNotificationManagerCompat.cs) e [testes de rede com Playwright](https://playwright.dev/docs/network).
