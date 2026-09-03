# Agenda Notifier para Windows

Aplicativo auxiliar que consulta a Agenda em segundo plano e mostra notificações nativas do Windows para tarefas e eventos.

## Compilar

Execute no PowerShell: `.\\windows-notifier\\build.ps1`

O executável é criado em `frontend/public/downloads/Agenda.Notifier.exe`. O build do Angular o copia para o diretório publicado, deixando-o disponível no botão **Baixar EXE**.

Na primeira execução ele se instala em `%LOCALAPPDATA%\\AgendaNotifier`, protege a chave com DPAPI e registra automaticamente sua inicialização com o Windows pelo perfil do usuário, sem exigir administrador. Se a entrada de inicialização for removida, ela é restaurada na próxima execução conectada.

A versão com ícone personalizado instala internamente como `Agenda.Notifier.v3.exe`, evitando conflito e cache das versões anteriores.
