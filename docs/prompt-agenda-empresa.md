# Prompt: Agenda Web Corporativa (estilo Google Agenda)

Crie uma aplicação web de agenda/calendário para uso interno da empresa, com as seguintes características:

## 1. Layout e Design
- Inspire-se no **Google Agenda (Google Calendar)**:
  - Barra lateral esquerda com um mini-calendário do mês para navegação rápida.
  - Área principal com visualização em grade (dia/semana/mês), com opção de alternar entre essas visões pelo topo.
  - Cabeçalho superior com título do mês/ano atual, setas de navegação (anterior/próximo) e botão "Hoje".
  - Eventos/tarefas exibidos como blocos coloridos dentro das células do calendário, com horário e título visíveis.
  - Botão flutuante ou fixo para "Criar novo evento/tarefa" (semelhante ao "+" do Google Agenda).
  - Modal ou painel lateral para criar/editar evento, com campos: título, data, horário de início/fim, descrição, cor/categoria.
- Utilize as skills disponíveis para garantir uma identidade visual consistente, tipografia adequada e escolhas de design intencionais (evitar aparência de template genérico).

## 2. Plataforma
- Deve ser uma aplicação **web** (HTML/CSS/JS, podendo usar React se fizer sentido para a complexidade do projeto).

## 3. Modo Dark/Light
- Implementar um **toggle de tema** no **canto inferior esquerdo** da tela.
- O botão deve ser um **switch deslizante (slider)** com um ícone de **sol** (modo light) e **lua** (modo dark), que desliza de um lado para o outro ao clicar.
- A troca de tema deve afetar toda a interface (cores de fundo, texto, blocos de eventos, sidebar, etc.), usando variáveis CSS para facilitar a alternância.

## 4. Feriados Nacionais
- A aplicação deve **buscar automaticamente os feriados nacionais** (do Brasil) e marcá-los no calendário como **dias não letivos/não úteis**, servindo de parâmetro para indicar quando a empresa estará em funcionamento ou não.
- Esses dias devem ser visualmente destacados (ex: cor diferenciada ou marcação "Feriado") e, se possível, bloqueados para criação de novos eventos de trabalho (ou ao menos com um aviso).
- Sugestão de fonte: API pública de feriados nacionais do Brasil (ex: BrasilAPI ou Invertexto), consultada dinamicamente por ano.

## 5. Drag and Drop
- Implementar **drag and drop** para tarefas/eventos:
  - Se uma tarefa não for concluída em um determinado dia, o usuário deve poder **arrastá-la para outro dia** do calendário.
  - Ao soltar, a data do evento deve ser atualizada automaticamente na interface (e persistida, se houver backend/armazenamento).

## 6. Requisitos técnicos gerais
- Utilizar as **skills globais** disponíveis como guia de boas práticas.
- Código organizado, componentizado e comentado onde necessário.
- Interface responsiva, mas com foco em uso desktop (uso interno na empresa).

---

**Objetivo final:** uma agenda corporativa funcional, com visual próximo ao Google Agenda, alternância dark/light via switch sol/lua, feriados nacionais automáticos como referência de dias não úteis, e suporte a drag and drop para reorganizar tarefas entre os dias.
