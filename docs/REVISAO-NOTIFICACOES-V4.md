# Revisão e entrega — Agenda Notifier 4

## Cobertura

Análise do código atual de backend, frontend e aplicativo Windows, com foco em autenticação, permissões, prazos, links, instalação e publicação. Verificação de sintaxe, tipos, build e codificação dos fontes. Cópias antigas em `frontend/release`, dependências e artefatos gerados não representam o código atual e não entram na verificação de fontes.

## Problemas corrigidos

1. Tarefas só eram notificadas no dia do prazo. Agora há antecedência configurável de 0 a 30 dias, padrão de um dia.
2. As preferências existiam na API, mas não tinham controles na tela. Foram adicionados controles e confirmação de salvamento.
3. O clique do balão dependia de uma variável global com a última notificação. Agora cada toast usa ativação por protocolo com sua própria URL.
4. O link do evento usava `day`, enquanto a aplicação usa `dia`, e a página não consumia o parâmetro `evento`. Agora abre o modal e seleciona a agenda correta.
5. A solicitação de login perdia o destino. O retorno à tarefa ou evento é preservado para a autenticação manual.
6. A antecedência dos eventos era limitada à meia-noite do próprio dia. Agora considera a ocorrência do dia seguinte e evita repetir a mesma ocorrência após a virada do dia.
7. O aplicativo não tinha Kanban de desktop. Foi acrescentado popup com seleção de quadro, opacidade, posição e tamanho persistentes, opção de ficar à frente e cartões clicáveis.
8. A atualização podia conflitar com o executável anterior em execução. O instalador encerra apenas cópias instaladas no diretório do perfil atual e preserva a configuração.
9. A API do notificador considerava o proprietário de um quadro de time mesmo sem associação atual. O acesso dos dispositivos agora segue a associação exigida pelo Kanban web.
10. O WebSocket aceitava conexão sem token e podia transmitir antes da validação. Agora exige autenticação, aguarda sua conclusão e trata falhas do SSO. O log do frontend deixou de imprimir a URL que continha o token.

## Evidências

- 30 testes Node aprovados, incluindo tarefas próximas, virada do dia, deduplicação, datas inválidas, acesso revogado, permissões do Kanban e autenticação WebSocket.
- TypeScript sem erros e build Angular de produção concluído.
- Compilação C# e testes do painel, opacidade, conteúdo XML e resolução de links aprovados.
- Envio real de toast ao Windows e confirmação no histórico do sistema, verificando `activationType="protocol"` e a URL. O aviso de teste foi removido.
- Painel renderizado e imagem inspecionada.
- Chrome headless com API simulada: retorno após login, abertura do evento, recarga sem duplicar o modal, abertura da tarefa e salvamento das preferências aprovados.
- Verificação UTF-8 dos fontes, com exceções específicas para palavras portuguesas legítimas identificadas pelo detector genérico.

## Limites e pontos identificados

- Não foi alterado nem exercitado o servidor corporativo ou o PostgreSQL de produção. A migração precisa ser executada pela inicialização da versão atualizada no servidor. Os testes de API e navegador usam dados simulados.
- O Windows confirmou o registro da notificação; o clique físico em um banner e o navegador conectado ao SSO de produção não foram exercitados juntos.
- O build mantém avisos de tamanho do bundle inicial e dos estilos de calendário e Kanban. Não impedem a compilação; otimização de carregamento continua pendente.
- O canal de sincronização ainda distribui identificadores de alterações entre usuários autenticados. As APIs de conteúdo validam acesso; filtrar esses metadados por agenda/time é uma melhoria separada identificada na revisão.
- O modelo atual não possui um estado explícito de conclusão de tarefa. Colunas têm nomes livres; mover para uma coluna chamada “Concluído” não equivale a arquivar. Os lembretes usam o estado ativo/arquivado existente.

## Atualizar o servidor

O pacote `Agenda-Servidor-v4-20260915.zip` contém `backend` com código e frontend compilado, `production-start.js`, `package.json` e instruções. Não inclui `.env`, banco de dados, uploads ou dependências.

1. Extraia para uma pasta de preparação e confira os arquivos.
2. No servidor, substitua os arquivos da aplicação com o processo parado, preservando `.env`, dados e uploads existentes. Se usar `FRONTEND_PATH`, publique o conteúdo de `backend/public` também no destino configurado.
3. Execute `npm --prefix backend ci --omit=dev` e inicie pelo processo de produção existente (`npm start` no arranjo padrão). A nova coluna de preferências será criada automaticamente.
4. Distribua o novo EXE ou use **Baixar EXE** na tela web. O EXE anterior não oferece o painel de desktop.

Esta entrega prepara os artefatos localmente; não publica nem reinicia o servidor corporativo.
