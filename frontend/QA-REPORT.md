# Relatório de QA

Data da revisão: 24/08/2026

## Escopo

- Agenda: criação, edição, exclusão, compartilhamento, permissões, arrastar e soltar e menus de contexto.
- Tarefas: times, quadros, colunas, cartões, subtarefas, arquivamento, reordenação e menus de contexto.
- Sincronização em tempo real, autenticação, validação da API, integridade do banco e tratamento de falhas.
- Build, verificação de tipos, testes automatizados e auditoria de dependências.

## Problemas corrigidos

### Segurança e integridade

- As APIs de agenda, eventos e kanban agora validam a identidade pelo portal corporativo e não confiam somente no cabeçalho enviado pelo navegador.
- Eventos não podem mais ser criados para agendas inexistentes.
- Reordenações não podem mover tarefas ou colunas entre quadros indevidamente.
- Entradas de eventos, agendas, times, quadros, colunas e tarefas são validadas no servidor.
- A agenda padrão passou a ter identificação persistente e não pode ser excluída ou tornada pública.
- Exclusões de colunas removem corretamente subtarefas descendentes e impedem a operação quando há tarefas ativas.

### Tempo real e resiliência

- WebSocket ganhou heartbeat e limpeza de conexões inativas.
- O fallback por SSE funciona quando a aplicação está publicada em um subdiretório, como `/agenda`.
- Mensagens duplicadas de WebSocket/SSE são descartadas.
- Reconexões e encerramentos intencionais não deixam temporizadores ou tentativas residuais.
- Falhas transitórias de rede não apagam os dados que já estavam visíveis na tela.
- O backend possui encerramento gracioso das conexões e do banco de dados.

### Interface e experiência

- Agenda e tarefas possuem menus de contexto acionados pelo botão direito, respeitando as permissões do usuário.
- Exclusões destrutivas exigem confirmação e aguardam a resposta real da API antes de atualizar ou fechar a interface.
- Formulários permanecem abertos e exibem erros quando a operação falha.
- Usuários somente leitores visualizam detalhes do evento sem receber controles de edição.
- Tarefas arquivadas não podem ser arrastadas.
- O placeholder de uma coluna vazia não encobre mais a tarefa durante o arraste.
- O cálculo de datas ao arrastar eventos não sofre desvio por fuso horário.
- O quinto dia útil considera sábado e domingo como fim de semana.
- Feriados são recarregados quando o ano do evento é alterado.

## Cobertura automatizada

- Validação de eventos, horários e tarefas.
- Conversão de placeholders SQL.
- Bloqueio de evento órfão.
- Bloqueio de reordenação entre quadros.
- Verificação TypeScript da aplicação.
- Build de produção e auditoria de dependências.

## Observações restantes

- O bundle inicial e alguns estilos de componentes ainda geram avisos de orçamento, sem impedir o build. A redução adicional exige uma etapa específica de divisão de código e revisão de estilos.
- A automação visual não pôde ser executada nesta máquina porque o navegador integrado não possui uma instância disponível. A validação realizada nesta rodada foi estática, por API, testes automatizados e build.
- Depois da atualização, o backend deve ser reiniciado para aplicar a migração da agenda padrão e os novos middlewares.
