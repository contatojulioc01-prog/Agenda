# 🤖 PROMPT — Implementação Completa de IA (Assistente + MCP) no Projeto DC --- AGENDA

---

## 🎯 CONTEXTO DO PROJETO

Projeto: **DC --- AGENDA** — Sistema de Agenda Corporativa Compartilhada.

**Stack:**
- **Frontend:** Angular 22, standalone components, Angular Material, SCSS, `@angular/cdk`, `rxjs`
- **Backend:** Node.js + Express (CommonJS, `require`), SQLite (`sql.js`) + PostgreSQL (`pg`), WebSocket (`ws`), porta padrão `9900`
- **Arquitetura frontend:**
  - `frontend/src/app/app.ts` + `app.html` — shell principal
  - `frontend/src/app/core/services/` — serviços injetáveis
  - `frontend/src/app/features/calendar/event-modal/` — modal de evento (MatDialog)
  - `frontend/src/app/features/tasks/kanban-board/` — quadro Kanban com modal de tarefa
  - `frontend/src/app/features/calendar/calendar-page/` — página principal com sidebar
  - `frontend/src/app/shared/components/` — componentes reutilizáveis

---

## 📋 OBJETIVO

Implementar **dois recursos de IA** integrados:

### 1. 🧠 Assistente de IA Global (Modal/Popup Flutuante)
Botão fixo na sidebar da `calendar-page` que abre um **modal/popup** sobreposto à interface, permitindo conversar com a IA sobre qualquer assunto (assistente geral).

### 2. ✍️ Botão de IA em Campos de Descrição
Em toda modal que contenha um campo `<textarea>` de descrição, adicionar um **botão de IA** com menu dropdown com as ações:
- **Melhorar escrita** — reescreve o texto mantendo o sentido, tornando mais claro e profissional
- **Revisão** — revisa gramática, ortografia e coesão
- **Explicar** — explica o conteúdo do campo com linguagem simples
- **Reformatar** — reorganiza o texto em tópicos/estrutura mais legível

---

## 🏗️ ARQUITETURA DA IMPLEMENTAÇÃO

### BACKEND — Rota MCP de IA (`/api/ai`)

**Arquivo:** `backend/routes/ai.js`

Criar rota Express com suporte a **streaming SSE** (Server-Sent Events) para o chat e respostas não-streaming para ações de texto:

```
POST /api/ai/chat         — Streaming SSE: conversa com o assistente
POST /api/ai/text-action  — JSON: ações sobre texto (melhorar, revisar, explicar, reformatar)
```

**Configuração da chave de API:**
- Leia `process.env.OPENAI_API_KEY` (ou `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` — use **Google Gemini API** preferencialmente, pois é gratuita).
- Se nenhuma chave estiver disponível, retorne erro `503` com mensagem clara.

**Integração com o backend existente:**
- Registrar as rotas no `backend/index.js` com `app.use('/api/ai', require('./routes/ai'))` — **após** a validação de token existente.
- Proteger com o mesmo middleware `validateUserToken` que já existe no projeto.

**Arquivo de ambiente:** Adicionar no `backend/.env.example`:
```
# IA — Chave de API (escolha um provedor)
GEMINI_API_KEY=
OPENAI_API_KEY=
AI_MODEL=gemini-3.1-flash-lite
AI_MAX_TOKENS=2048
```

**Implementação da rota `POST /api/ai/chat` (streaming):**
```
- Recebe: { messages: [{role, content}], systemPrompt? }
- Faz streaming para o cliente via SSE (text/event-stream)
- Formato de evento: data: {"delta": "trecho do texto"}\n\n
- Ao finalizar: data: [DONE]\n\n
- System prompt padrão: "Você é um assistente de agenda corporativa. Ajude com organização de tempo, redação de eventos, tarefas e produtividade."
```

**Implementação da rota `POST /api/ai/text-action` (JSON):**
```
- Recebe: { text: string, action: "improve" | "review" | "explain" | "reformat" }
- Retorna: { result: string }
- Prompts por ação:
  - improve: "Melhore a escrita do texto a seguir, tornando-o mais claro, profissional e conciso, mantendo o sentido original:"
  - review: "Revise o texto a seguir, corrigindo erros de gramática, ortografia e coesão textual. Retorne apenas o texto corrigido:"
  - explain: "Explique o conteúdo do texto a seguir em linguagem simples e direta, como se fosse para alguém que não conhece o contexto:"
  - reformat: "Reformate o texto a seguir em uma estrutura mais organizada, usando tópicos ou parágrafos curtos quando apropriado. Mantenha todas as informações:"
```

---

### FRONTEND — Serviço de IA

**Arquivo:** `frontend/src/app/core/services/ai.service.ts`

```typescript
// Serviço Angular standalone (providedIn: 'root')
// Métodos:
// - chat(messages: {role: string, content: string}[]): Observable<string>  — retorna chunks via SSE
// - textAction(text: string, action: AiTextAction): Observable<string>     — retorna resultado completo
// - readonly isAvailable: Signal<boolean>                                  — true se backend respondeu OK

// Usa fetch() com ReadableStream para consumir SSE
// AiTextAction = 'improve' | 'review' | 'explain' | 'reformat'
// Injeta AuthService para pegar o token JWT e enviar no header Authorization
```

---

### FRONTEND — Componente Assistente Global

**Pasta:** `frontend/src/app/shared/components/ai-assistant/`
**Arquivos:** `ai-assistant.component.ts`, `ai-assistant.component.html`, `ai-assistant.component.scss`

**Comportamento:**
- Componente standalone
- Controlado por um **Signal booleano** `isOpen` em `AiService` (ou serviço próprio `AiAssistantService`)
- **Não usa MatDialog** — é um elemento DOM fixo com `position: fixed`, `z-index: 2000`, animação de slide-up/fade-in
- Sobrepõe a interface inteira como um painel lateral direito ou modal centralizado

**Layout visual do assistente:**
```
┌─────────────────────────────────────────┐
│ 🤖 Assistente IA          [_] [✕]       │  ← header com botão minimizar e fechar
├─────────────────────────────────────────┤
│                                          │
│  [mensagens do chat em scroll]           │  ← área de mensagens com bolhas
│  • user: texto azul/cinza               │
│  • assistant: texto branco/gradiente    │
│                                          │
├─────────────────────────────────────────┤
│  [textarea] [Enviar ▶]                  │  ← input com shift+enter quebra linha
└─────────────────────────────────────────┘
```

**Requisitos do componente:**
- Histórico de mensagens: `Signal<{role, content, timestamp}[]>`
- Indicador de digitação (loading dots) enquanto aguarda resposta
- Botão "Nova conversa" para limpar histórico
- Suporte a Markdown básico na renderização das respostas (negrito, código inline, listas) — use innerHTML seguro ou implemente parser simples
- Tecla `Escape` fecha o assistente
- Tecla `Enter` envia mensagem, `Shift+Enter` quebra linha
- Scroll automático para última mensagem
- Responsivo: em mobile ocupa tela inteira

**SCSS do assistente — estilo premium:**
```scss
// Glassmorphism + gradiente escuro
// Backdrop semi-transparente com blur
// Animação: translateY(100%) → translateY(0) com ease-out
// Gradiente de fundo: linear-gradient(135deg, #0f0c29, #302b63, #24243e)
// Botões com hover glow effect
// Scrollbar customizada (thin, cor brand)
// Mensagens do usuário: balão à direita, cor brand-500
// Mensagens da IA: balão à esquerda, cor surface-elevated
```

---

### FRONTEND — Integração na Sidebar (Botão de Abertura)

**Arquivo:** `frontend/src/app/features/calendar/calendar-page/calendar-page.component.html`

Adicionar na sidebar, **após os botões de navegação** (Agenda/Tarefas) e **antes** do botão "Criar evento":

```html
<!-- Botão IA na sidebar -->
<button 
  class="btn-ai-assistant" 
  (click)="openAiAssistant()" 
  id="btn-open-ai-assistant"
  matTooltip="Abrir Assistente de IA"
  aria-label="Abrir Assistente de IA">
  <mat-icon>auto_awesome</mat-icon>
  <span>Assistente IA</span>
  <span class="ai-badge">IA</span>
</button>
```

**No componente `calendar-page.component.ts`:**
```typescript
// Injetar AiService
// Método: openAiAssistant() { this.aiService.openAssistant(); }
```

**No `calendar-page.component.html`** (no final do template):
```html
<!-- Assistente de IA Global -->
@if (aiService.isAssistantOpen()) {
  <app-ai-assistant />
}
```

**SCSS do botão na sidebar (`calendar-page.component.scss`):**
```scss
.btn-ai-assistant {
  // Estilo similar aos outros botões da sidebar
  // Com gradiente sutil e ícone pulsante (animação suave)
  // Badge "IA" com cor verde/ciano para destacar
  // Hover: glow effect com a cor brand
}
```

---

### FRONTEND — Componente Botão de IA para Campos de Texto

**Pasta:** `frontend/src/app/shared/components/ai-text-button/`
**Arquivos:** `ai-text-button.component.ts`, `ai-text-button.component.html`, `ai-text-button.component.scss`

**Interface do componente:**
```typescript
@Component({
  selector: 'app-ai-text-button',
  standalone: true,
  // ...
})
export class AiTextButtonComponent {
  @Input() text = '';                    // texto atual do campo
  @Output() textChange = new EventEmitter<string>(); // texto processado pela IA
  
  // Controla o menu dropdown de ações
  isMenuOpen = signal(false);
  isLoading = signal(false);
  activeAction = signal<AiTextAction | null>(null);
  
  // Ações disponíveis
  actions = [
    { id: 'improve', label: 'Melhorar escrita', icon: 'auto_fix_high' },
    { id: 'review',  label: 'Revisão',          icon: 'spellcheck'   },
    { id: 'explain', label: 'Explicar',          icon: 'lightbulb'    },
    { id: 'reformat',label: 'Reformatar',        icon: 'format_align_left' },
  ];
}
```

**Layout HTML do componente:**
```html
<div class="ai-text-btn-wrap">
  <!-- Botão principal -->
  <button type="button" 
    class="ai-trigger-btn"
    [class.loading]="isLoading()"
    [disabled]="isLoading() || !text?.trim()"
    (click)="toggleMenu()"
    [attr.aria-expanded]="isMenuOpen()"
    matTooltip="Assistente de escrita IA"
    id="btn-ai-text-action">
    
    @if (isLoading()) {
      <mat-progress-spinner mode="indeterminate" diameter="16" class="btn-spinner" />
    } @else {
      <mat-icon>auto_awesome</mat-icon>
    }
    <span>IA</span>
  </button>

  <!-- Dropdown menu de ações -->
  @if (isMenuOpen()) {
    <div class="ai-actions-menu" role="menu">
      @for (action of actions; track action.id) {
        <button 
          type="button"
          class="ai-action-item"
          role="menuitem"
          [class.active]="activeAction() === action.id"
          (click)="runAction(action.id)"
          [id]="'btn-ai-action-' + action.id">
          <mat-icon>{{ action.icon }}</mat-icon>
          <span>{{ action.label }}</span>
        </button>
      }
    </div>
    <!-- Backdrop para fechar ao clicar fora -->
    <div class="ai-menu-backdrop" (click)="isMenuOpen.set(false)"></div>
  }
</div>
```

**SCSS do ai-text-button:**
```scss
// Botão compacto com ícone e label "IA"
// Gradiente brand-500 → brand-600
// Dropdown com glassmorphism, border brand color
// Cada item do menu com ícone colorido e hover highlight
// Spinner inline substituindo o ícone durante loading
// Animação de entrada do dropdown: scale(0.95) opacity(0) → scale(1) opacity(1)
```

---

### FRONTEND — Integração nas Modais Existentes

#### Modal de Evento (`event-modal.component`)

**Arquivo:** `frontend/src/app/features/calendar/event-modal/event-modal.component.html`

Localizar a seção do campo `description` (textarea de descrição do evento) e adicionar o `app-ai-text-button` como elemento irmão, com binding de duas vias:

```html
<!-- Campo de descrição existente -->
<div class="form-field col-span-2 description-field">
  <div class="description-header">
    <label for="ev-description">Descrição</label>
    <!-- NOVO: Botão IA ao lado do label -->
    <app-ai-text-button
      [text]="formData.description"
      (textChange)="formData.description = $event"
    />
  </div>
  <textarea
    id="ev-description"
    [(ngModel)]="formData.description"
    name="description"
    rows="3"
    placeholder="Adicione uma descrição..."
  ></textarea>
</div>
```

Importar `AiTextButtonComponent` no array `imports` do `EventModalComponent`.

#### Modal de Tarefa Kanban

**Arquivo:** `frontend/src/app/features/tasks/kanban-board/kanban-board.component.html`

Localizar todos os campos `<textarea>` de descrição de tarefas (modal de criar/editar tarefa) e aplicar o mesmo padrão:

```html
<div class="description-header">
  <label>Descrição</label>
  <app-ai-text-button
    [text]="taskForm.description"
    (textChange)="taskForm.description = $event"
  />
</div>
<textarea [(ngModel)]="taskForm.description" ...></textarea>
```

---

## 📁 ESTRUTURA DE ARQUIVOS A CRIAR/MODIFICAR

```
backend/
├── routes/
│   └── ai.js                          [NOVO] Rotas da IA (/chat e /text-action)
├── index.js                           [MODIFICAR] Registrar app.use('/api/ai', ...)
└── .env.example                       [MODIFICAR] Adicionar variáveis de IA

frontend/src/app/
├── core/
│   └── services/
│       └── ai.service.ts              [NOVO] Serviço Angular de IA
├── shared/
│   └── components/
│       ├── ai-assistant/              [NOVO] Componente do assistente global
│       │   ├── ai-assistant.component.ts
│       │   ├── ai-assistant.component.html
│       │   └── ai-assistant.component.scss
│       └── ai-text-button/            [NOVO] Botão de IA para campos de texto
│           ├── ai-text-button.component.ts
│           ├── ai-text-button.component.html
│           └── ai-text-button.component.scss
├── features/
│   └── calendar/
│       ├── calendar-page/
│       │   ├── calendar-page.component.html   [MODIFICAR] Adicionar botão e <app-ai-assistant>
│       │   ├── calendar-page.component.ts     [MODIFICAR] Injetar AiService, método openAiAssistant()
│       │   └── calendar-page.component.scss   [MODIFICAR] Estilo do botão na sidebar
│       └── event-modal/
│           ├── event-modal.component.html     [MODIFICAR] Adicionar <app-ai-text-button> no campo descrição
│           └── event-modal.component.ts       [MODIFICAR] Importar AiTextButtonComponent
└── features/tasks/kanban-board/
    ├── kanban-board.component.html            [MODIFICAR] Adicionar <app-ai-text-button> no campo descrição de tarefas
    └── kanban-board.component.ts             [MODIFICAR] Importar AiTextButtonComponent
```

---

## ⚙️ REGRAS E BOAS PRÁTICAS DO PROJETO

1. **Angular 22 standalone** — todos os componentes usam `standalone: true` com `imports: [...]`. **Nunca** usar `NgModule`.
2. **CommonModule** — importar `CommonModule` em todos os componentes que usam `*ngIf`, `*ngFor`, `| number`, etc. E também usar `@if` / `@for` (novo control flow) se o componente já usar.
3. **Backend CommonJS** — o backend usa `require()` e `module.exports`, **não** ES modules.
4. **Autenticação** — o token JWT está no localStorage como `agenda_token`. O serviço `AuthService` já expõe `currentUser()` signal e o token. O serviço de IA deve ler o token via `AuthService` e enviar como `Authorization: Bearer <token>` em todas as requisições.
5. **Streaming SSE no frontend** — use `fetch()` nativo com `ReadableStream` (não `HttpClient`) para consumir o SSE do chat, pois `HttpClient` não suporta streaming incremental facilmente.
6. **Tipagem TypeScript** — tipar tudo corretamente. Definir interfaces em arquivos separados ou inline no serviço.
7. **Loading states** — qualquer botão que acione requisição HTTP deve ter estado `disabled` + spinner enquanto aguarda (padrão já existente no projeto: `mat-progress-spinner` com `diameter="18"` + classe `button-spinner`).
8. **Responsividade** — o assistente deve funcionar em telas menores (mobile-first para o modal).
9. **Erro handling** — em caso de erro na API de IA, exibir mensagem amigável no chat ("Ocorreu um erro. Tente novamente.") e não travar a interface.
10. **SCSS** — estilos do assistente devem usar as variáveis CSS existentes do projeto: `--brand-500`, `--brand-600`, `--surface-elevated`, `--text-primary`, `--text-secondary`, etc.

---

## 🔑 CONFIGURAÇÃO DE API — PRIORIDADE DE PROVIDERS

O backend deve tentar os providers nesta ordem:
1. **Google Gemini** (`GEMINI_API_KEY`) — modelo `gemini-3.1-flash-lite` — **preferencial**
2. **OpenAI** (`OPENAI_API_KEY`) — modelo `gpt-4o-mini`
3. Se nenhuma chave configurada → retornar `{ error: "IA não configurada. Adicione GEMINI_API_KEY ou OPENAI_API_KEY no .env" }`

**Implementação para Gemini (REST API):**
```javascript
// POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?key=API_KEY
// Body: { contents: [...messages], generationConfig: { maxOutputTokens: 2048 } }
// Streaming: usar https.request com chunks
```

**Implementação para OpenAI:**
```javascript
// POST https://api.openai.com/v1/chat/completions
// Header: Authorization: Bearer API_KEY
// Body: { model: "gpt-4o-mini", messages, stream: true }
```

---

## 🎨 DESIGN DO ASSISTENTE — ESPECIFICAÇÕES VISUAIS DETALHADAS

```
Posição: fixed, canto inferior direito ou centro da tela
Tamanho: 420px de largura, 600px de altura (desktop)
Mobile: 100vw × 100vh
Z-index: 2000 (acima de tudo)

Backdrop: rgba(0,0,0,0.5) + backdrop-filter: blur(4px)
Painel: border-radius 16px, overflow hidden
Background: linear-gradient(160deg, #0d1117 0%, #161b22 60%, #1c2128 100%)
Border: 1px solid rgba(99, 102, 241, 0.3)
Box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)

Header:
  Background: rgba(99, 102, 241, 0.1)
  Border-bottom: 1px solid rgba(255,255,255,0.08)
  Ícone: mat-icon "auto_awesome" com cor brand

Mensagens do usuário:
  Alinhamento: direita
  Background: linear-gradient(135deg, var(--brand-500), var(--brand-600))
  Color: white
  Border-radius: 16px 16px 4px 16px

Mensagens da IA:
  Alinhamento: esquerda
  Background: rgba(255,255,255,0.06)
  Border: 1px solid rgba(255,255,255,0.1)
  Color: var(--text-primary)
  Border-radius: 16px 16px 16px 4px

Input area:
  Background: rgba(255,255,255,0.04)
  Border-top: 1px solid rgba(255,255,255,0.08)
  Textarea: sem borda, background transparente, cor --text-primary
  Botão enviar: circular, background brand-500, hover scale(1.05)

Animação de abertura:
  @keyframes slideUp { from { opacity:0; transform: translateY(20px) scale(0.97) } to { opacity:1; transform: translateY(0) scale(1) } }
  animation: slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

### Backend
- [ ] Criar `backend/routes/ai.js` com rotas `/chat` (SSE) e `/text-action` (JSON)
- [ ] Implementar suporte a Gemini API com streaming
- [ ] Implementar suporte a OpenAI API com streaming
- [ ] Registrar rotas em `backend/index.js` com proteção de token
- [ ] Adicionar variáveis ao `backend/.env.example`

### Frontend — Serviço
- [ ] Criar `ai.service.ts` com métodos `chat()` e `textAction()`
- [ ] Expor signal `isAssistantOpen()` para controlar visibilidade
- [ ] Implementar `fetch()` com ReadableStream para SSE
- [ ] Ler token do `AuthService` e enviar em todas as requisições

### Frontend — Assistente Global
- [ ] Criar componente `ai-assistant` (ts + html + scss)
- [ ] Implementar chat com histórico de mensagens
- [ ] Adicionar indicador de digitação (loading dots)
- [ ] Implementar streaming incremental de texto no chat
- [ ] Suporte a Escape para fechar
- [ ] Enter para enviar, Shift+Enter para nova linha
- [ ] Design premium (glassmorphism, animações)
- [ ] Botão "Nova conversa"

### Frontend — Botão de IA em Textos
- [ ] Criar componente `ai-text-button` (ts + html + scss)
- [ ] Implementar dropdown com 4 ações
- [ ] Loading state durante processamento
- [ ] Emitir texto processado via `(textChange)`

### Frontend — Integrações
- [ ] Adicionar botão "Assistente IA" na sidebar da `calendar-page`
- [ ] Renderizar `<app-ai-assistant>` no template da `calendar-page`
- [ ] Adicionar `<app-ai-text-button>` no campo descrição do `event-modal`
- [ ] Adicionar `<app-ai-text-button>` no(s) campo(s) de descrição do Kanban
- [ ] Importar novos componentes nos arrays `imports` corretos

---

## 📝 NOTAS FINAIS

- **Não quebrar funcionalidades existentes.** O projeto possui: calendário, kanban, notificações, autenticação JWT, WebSocket de sincronização em tempo real. Não altere nenhuma dessas rotas ou lógicas.
- **O campo de descrição na modal de evento** está no grupo "Detalhes" do formulário, dentro de um `form-card`. Adicione o botão de IA ao lado do `<label>` existente, não remova ou altere o `<textarea>`.
- **Se o campo de descrição de tarefas no Kanban estiver em um componente modal separado** (ex: dialog de edição de task), aplique o padrão lá também.
- **Variáveis de ambiente:** não modifique o arquivo `.env` real — apenas o `.env.example`.
- **Qualidade visual é crítica**: o assistente deve parecer premium, integrado com o visual escuro/elegante já existente no projeto.
