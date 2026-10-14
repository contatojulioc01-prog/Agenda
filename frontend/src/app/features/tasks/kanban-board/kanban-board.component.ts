import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { KanbanService } from '../../../core/services/kanban.service';
import { KanbanColumn, KanbanTask, KanbanTaskInput, KanbanTeam, KanbanTeamMember, TaskPriority } from '../../../core/models/kanban.model';
import { DEFAULT_AVATAR } from '../../../core/models/user.model';
import { Attachment } from '../../../core/models/attachment.model';
import { AttachmentsService } from '../../../core/services/attachments.service';
import { forkJoin } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AiTextButtonComponent } from '../../../shared/components/ai-text-button/ai-text-button.component';
import { MarkdownTextComponent } from '../../../shared/components/markdown-text/markdown-text.component';
import { MarkdownEditorComponent } from '../../../shared/components/markdown-editor/markdown-editor.component';
import { AttachmentPreviewModalComponent } from '../../../shared/components/attachment-preview-modal/attachment-preview-modal.component';
import { detectFileType } from '../../../core/utils/code-highlight.util';

export type ColumnFieldType = 'text' | 'date' | 'number' | 'select' | 'checkbox' | 'person' | 'system';

export interface TableColumnDef {
  id: string;
  label: string;
  icon: string;
  visible: boolean;
  type?: ColumnFieldType;
  options?: string[];
  isCustom?: boolean;
}

export const DEFAULT_TABLE_COLUMNS: TableColumnDef[] = [
  { id: 'subject', label: 'Assunto', icon: 'title', visible: true, type: 'system' },
  { id: 'status', label: 'Status', icon: 'donut_large', visible: true, type: 'system' },
  { id: 'priority', label: 'Prioridade', icon: 'flag', visible: true, type: 'system' },
  { id: 'assignee', label: 'Responsável', icon: 'person', visible: true, type: 'system' },
  { id: 'date', label: 'Prazo', icon: 'event', visible: true, type: 'system' },
  { id: 'demand', label: 'Demanda', icon: 'notes', visible: true, type: 'system' },
  { id: 'labels', label: 'Etiquetas', icon: 'sell', visible: true, type: 'system' },
];

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MatIconModule,
    MatTooltipModule,
    AiTextButtonComponent,
    MarkdownTextComponent,
    MarkdownEditorComponent,
    AttachmentPreviewModalComponent,
  ],
  templateUrl: './kanban-board.component.html',
  styleUrl: './kanban-board.component.scss',
})
export class KanbanBoardComponent implements OnDestroy {
  readonly service = inject(KanbanService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly attachmentsService = inject(AttachmentsService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly board = this.service.activeBoard;
  readonly boards = this.service.boards;
  readonly loading = this.service.loading;
  readonly teams = this.service.teams;
  readonly teamInvitations = this.service.teamInvitations;
  readonly defaultAvatar = DEFAULT_AVATAR;
  private loadedWorkspaceUserId = '';
  private loadedTeamMembersKey = '';
  private readonly workspaceInitialization = effect(() => {
    const userId = this.auth.currentUser()?.id;
    if (!userId || userId === this.loadedWorkspaceUserId) return;
    this.loadedWorkspaceUserId = userId;
    this.service.loadWorkspace(this.route.snapshot.paramMap.get('boardId') || undefined);
  });
  private readonly activeTeamMembersSynchronization = effect(() => {
    const userId = this.auth.currentUser()?.id;
    const board = this.board();
    if (!userId || !board) return;
    const teamId = board.scopeType === 'team' ? board.teamId : null;
    const key = `${userId}|${teamId || 'personal'}`;
    if (key === this.loadedTeamMembersKey) return;
    this.loadedTeamMembersKey = key;
    if (teamId) this.service.loadTeamMembers(teamId);
    else this.service.clearTeamMembers();
  });

  readonly search = signal('');
  readonly priorityFilter = signal<TaskPriority | 'all'>('all');
  readonly assigneeFilter = signal('all');
  readonly showArchived = signal(false);
  readonly activeTab = signal<'month_tasks' | 'month_completed' | 'week_tasks' | 'kanban'>((typeof localStorage !== 'undefined' && localStorage.getItem('dc_kanban_active_tab') as any) || 'month_tasks');
  readonly viewMode = signal<'kanban' | 'list'>('list');
  readonly sortOption = signal<'default' | 'dueDate' | 'priority' | 'title' | 'status'>('default');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');
  readonly showSortMenu = signal(false);
  readonly showColumnManager = signal(false);
  readonly showFilterMenu = signal(false);
  readonly showMoreMenu = signal(false);
  readonly hasActiveFilters = computed(() => this.priorityFilter() !== 'all' || this.assigneeFilter() !== 'all');
  readonly activeFilterCount = computed(() => (this.priorityFilter() !== 'all' ? 1 : 0) + (this.assigneeFilter() !== 'all' ? 1 : 0));
  readonly tableColumns = signal<TableColumnDef[]>(this.loadInitialTableColumns());
  readonly customColumns = computed(() => this.tableColumns().filter(c => c.isCustom));
  readonly activeCustomColumns = computed(() => this.tableColumns().filter(c => c.isCustom && c.visible));
  readonly visibleColumnsCount = computed(() => this.tableColumns().filter(c => c.visible).length);
  readonly inlineEditingCell = signal<{ taskId: string; field: string } | null>(null);
  inlineEditValue = '';
  readonly isFullscreen = signal(false);
  readonly modalOpen = signal(false);
  readonly isTaskReadOnly = signal(false);
  readonly editingId = signal<string | null>(null);

  // Column Resizing & Persistence in LocalStorage
  readonly resizingColumnId = signal<string | null>(null);
  readonly columnWidths = signal<Record<string, number>>(this.loadInitialColumnWidths());
  readonly kanbanColumnWidths = signal<Record<string, number>>(this.loadInitialKanbanColumnWidths());
  private resizeMoveListener: ((e: MouseEvent) => void) | null = null;
  private resizeUpListener: ((e: MouseEvent) => void) | null = null;

  private readonly defaultTableWidths: Record<string, number> = {
    subject: 260,
    status: 140,
    priority: 115,
    assignee: 135,
    date: 115,
    demand: 220,
    labels: 160,
  };
  private readonly defaultKanbanColumnWidth = 304;

  // Dynamic Custom Columns Management
  newCustomColumnLabel = '';
  newCustomColumnType: ColumnFieldType = 'text';
  newCustomColumnOptions = '';
  readonly showAddColumnPopover = signal(false);

  // Modal Custom Properties state
  draftCustomFields: Record<string, any> = {};
  readonly showAddPropertyInModal = signal(false);
  newPropertyLabelInModal = '';
  newPropertyTypeInModal: ColumnFieldType = 'text';
  newPropertyOptionsInModal = '';

  draftSector = '';
  draftMacroTheme = '';
  draftExecutionDate = '';
  draftOrder = '';
  draftNetworkPath = '';

  readonly predefinedSectors = [
    'Gráfico - P&D',
    'Compras / Impressão',
    'PCP / Produção',
    'Gráfico - Arte final',
    'Social Media - Gráfica',
    'Licenças / Royalties',
    'Comercial',
    'Financeiro',
    'Diretoria'
  ];

  readonly predefinedMacroThemes = [
    'Compras',
    'Galeroca',
    'PCP',
    'Enlace Rei Leão Massinha',
    'Enlace Rei Leão Slime Crunch',
    'Enlace Rei Leão Slime Metalizado',
    'Gelelé Venom',
    'Maria Clara & JP',
    'Gelelê',
    'Geral'
  ];
  readonly addingColumn = signal(false);
  readonly addingBoard = signal(false);
  readonly teamModalOpen = signal(false);
  readonly creatingTeam = signal(false);
  readonly parentStack = signal<KanbanTask[]>([]);
  readonly columnMenuId = signal<string | null>(null);
  readonly columnDialog = signal<'rename' | 'delete' | null>(null);
  readonly selectedColumn = signal<KanbanColumn | null>(null);
  readonly boardNameDialogOpen = signal(false);
  readonly branchConfirmationTask = signal<KanbanTask | null>(null);
  readonly memberRemovalTarget = signal<KanbanTeamMember | null>(null);
  readonly dragOverColumnId = signal<string | null>(null);
  readonly teamContextMenu = signal<{ team: KanbanTeam; x: number; y: number } | null>(null);
  readonly taskContextMenu = signal<{ task: KanbanTask; x: number; y: number } | null>(null);
  readonly teamDeleteTarget = signal<KanbanTeam | null>(null);
  readonly taskDeleteTarget = signal<KanbanTask | null>(null);
  readonly trashOpen = signal(false);
  readonly permanentDeleteTarget = signal<KanbanTask | null>(null);
  readonly expandedChecklistIds = signal<Set<string>>(new Set());
  readonly savingTask = signal(false);
  readonly attachmentPreviewUrl = signal<string | null>(null);
  readonly attachmentPreviewName = signal('');
  readonly attachmentPreviewMimeType = signal('');
  readonly attachmentPreviewRawContent = signal<string | null>(null);
  readonly attachmentPreviewByteSize = signal<number | undefined>(undefined);
  readonly attachmentPreviewCurrent = signal<Attachment | null>(null);
  readonly trustedAttachmentPreviewUrl = signal<SafeResourceUrl | null>(null);
  readonly teamDeleteLoading = signal(false);
  readonly taskDeleteLoading = signal(false);
  readonly trashActionLoading = signal(false);
  readonly printingSingleTask = signal(false);
  readonly inviteableUsers = computed(() => [...this.auth.allUsers()].sort((first, second) =>
    (first.name || first.email || '').localeCompare(second.name || second.email || '', 'pt-BR', { sensitivity: 'base' })
  ));
  private readonly routeState = signal({ boardId: '', taskId: '', parentId: '', columnId: '', action: '', search: '', priority: 'all', assignee: 'all', archived: false });
  private hydratedRouteKey = '';
  private readonly routeHydration = effect(() => {
    const state = this.routeState();
    const board = this.board();
    if (!board || (state.boardId && state.boardId !== board.id)) return;
    // O Kanban permanece montado (apenas oculto) quando o usuário abre a
    // Agenda. Só complete uma URL sem boardId se a rota atual for realmente
    // do módulo de tarefas; caso contrário este efeito sequestra a navegação
    // e manda o usuário de volta ao último quadro.
    if (!state.boardId && this.router.url.split('?')[0].startsWith('/tarefas')) {
      void this.router.navigate(['/tarefas', board.id], { replaceUrl: true });
    }
    const key = `${board.id}|${state.taskId}|${state.parentId}|${state.columnId}|${state.action}|${state.search}|${state.priority}|${state.assignee}|${state.archived}`;
    if (key === this.hydratedRouteKey) return;
    this.hydratedRouteKey = key;

    this.search.set(state.search);
    this.priorityFilter.set(['urgent', 'high', 'medium', 'low'].includes(state.priority) ? state.priority as TaskPriority : 'all');
    this.assigneeFilter.set(state.assignee || 'all');
    this.showArchived.set(state.archived);

    if (state.parentId) {
      const ancestors: KanbanTask[] = [];
      let current = board.tasks.find(task => task.id === state.parentId);
      while (current) {
        ancestors.unshift(current);
        current = current.parentTaskId ? board.tasks.find(task => task.id === current?.parentTaskId) : undefined;
      }
      this.parentStack.set(ancestors);
    } else {
      this.parentStack.set([]);
    }

    const task = state.taskId ? board.tasks.find(item => item.id === state.taskId) : undefined;
    if (task) this.openEditDraft(task);
    else if (state.action === 'nova-tarefa') this.openCreateDraft(state.columnId || undefined);
    else this.modalOpen.set(false);
  });

  readonly columnColors = [
    { value: '#64748b', label: 'Cinza (Padrão)' },
    { value: '#4f46e5', label: 'Índigo' },
    { value: '#0284c7', label: 'Azul' },
    { value: '#0d9488', label: 'Verde-azulado' },
    { value: '#10b981', label: 'Esmeralda' },
    { value: '#f59e0b', label: 'Âmbar' },
    { value: '#f97316', label: 'Laranja' },
    { value: '#ef4444', label: 'Vermelho' },
    { value: '#e11d48', label: 'Rosa' },
    { value: '#9333ea', label: 'Roxo' },
    { value: '#db2777', label: 'Pink' },
    { value: '#06b6d4', label: 'Ciano' },
  ];

  newColumnTitle = '';
  newColumnColor = '#64748b';
  newColumnAutoArchiveDelay = 'never';
  newBoardName = '';
  newTeamDescription = '';
  newTeamColor = '#4f46e5';
  invitedUserId = '';
  labelText = '';
  checklistText = '';
  checklistGroupTitle = '';
  activeChecklistGroup: string | undefined = undefined;
  customChecklistGroups: string[] = [];
  quickSectionPresets = ['Preparação', 'Execução', 'Revisão', 'Entrega', 'Aprovações'];
  sectionItemDrafts: Record<string, string> = {};
  showAddSectionForm = false;
  pendingFiles: File[] = [];
  attachmentError = '';
  columnTitleDraft = '';
  columnColorDraft = '#64748b';
  columnAutoArchiveDelayDraft = 'never';
  boardNameDraft = '';

  draft: KanbanTaskInput = this.emptyDraft('');

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('afterprint', () => {
        this.printingSingleTask.set(false);
      });
    }
    const updateRouteState = () => {
      const params = this.route.snapshot.paramMap;
      const query = this.route.snapshot.queryParamMap;
      this.routeState.set({
        boardId: params.get('boardId') || '',
        taskId: query.get('tarefa') || '',
        parentId: query.get('ramificacao') || '',
        columnId: query.get('lista') || '',
        action: query.get('acao') || '',
        search: query.get('busca') || '',
        priority: query.get('prioridade') || 'all',
        assignee: query.get('responsavel') || 'all',
        archived: query.get('arquivadas') === '1',
      });
      const requestedBoardId = params.get('boardId');
      if (requestedBoardId && this.board()?.id && this.board()?.id !== requestedBoardId) {
        this.service.loadBoard(requestedBoardId);
      }
    };
    this.route.paramMap.subscribe(updateRouteState);
    this.route.queryParamMap.subscribe(updateRouteState);
  }

  ngOnDestroy(): void {
    this.closeAttachmentPreview();
    this.cleanupResizeListeners();
    if (typeof document !== 'undefined') {
      document.body.classList.remove('kanban-fullscreen-active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }

  toggleFullscreen(): void {
    const next = !this.isFullscreen();
    this.isFullscreen.set(next);
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('kanban-fullscreen-active', next);
    }
  }

  readonly visibleTasks = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('pt-BR');
    const priority = this.priorityFilter();
    const assignee = this.assigneeFilter();
    const archived = this.showArchived();
    return (this.board()?.tasks || []).filter(task => {
      const haystack = `${task.title} ${task.description} ${task.labels.join(' ')}`.toLocaleLowerCase('pt-BR');
      return task.parentTaskId === this.currentParentId() && task.archived === archived && (!query || haystack.includes(query)) &&
        (priority === 'all' || task.priority === priority) &&
        (assignee === 'all' || task.assigneeIds.includes(assignee));
    });
  });

  readonly tabFilteredTasks = computed(() => {
    const tasks = this.visibleTasks();
    const tab = this.activeTab();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (tab === 'month_completed') {
      return tasks.filter(t => {
        const title = this.getColumnTitle(t.columnId).toLowerCase();
        return title.includes('finaliz') || title.includes('conclu') || title.includes('done');
      });
    }

    if (tab === 'week_tasks') {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      return tasks.filter(t => {
        if (!t.dueDate) return true;
        const d = new Date(t.dueDate.includes('T') ? t.dueDate : `${t.dueDate}T12:00:00`);
        return d >= monday && d <= sunday;
      });
    }

    if (tab === 'month_tasks') {
      return tasks.filter(t => {
        if (!t.dueDate) return true;
        const d = new Date(t.dueDate.includes('T') ? t.dueDate : `${t.dueDate}T12:00:00`);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
    }

    return tasks;
  });

  readonly sortedVisibleTasks = computed(() => {
    const tasks = [...this.tabFilteredTasks()];
    const option = this.sortOption();
    const dir = this.sortDirection() === 'asc' ? 1 : -1;
    const board = this.board();

    if (option === 'default') {
      const colOrderMap = new Map<string, number>();
      board?.columns.forEach((col, idx) => colOrderMap.set(col.id, col.position ?? idx));
      return tasks.sort((a, b) => {
        const colA = colOrderMap.get(a.columnId) ?? 0;
        const colB = colOrderMap.get(b.columnId) ?? 0;
        if (colA !== colB) return colA - colB;
        return a.position - b.position;
      });
    }

    if (option === 'dueDate') {
      return tasks.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate) * dir;
      });
    }

    if (option === 'priority') {
      const priorityWeight: Record<TaskPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
      return tasks.sort((a, b) => (priorityWeight[b.priority] - priorityWeight[a.priority]) * dir);
    }

    if (option === 'title') {
      return tasks.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' }) * dir);
    }

    if (option === 'status') {
      const colOrderMap = new Map<string, number>();
      board?.columns.forEach((col, idx) => colOrderMap.set(col.id, col.position ?? idx));
      return tasks.sort((a, b) => {
        const colA = colOrderMap.get(a.columnId) ?? 0;
        const colB = colOrderMap.get(b.columnId) ?? 0;
        return (colA - colB) * dir;
      });
    }

    return tasks;
  });

  readonly tasksByColumn = computed(() => {
    const map = new Map<string, KanbanTask[]>();
    for (const column of this.board()?.columns || []) map.set(column.id, []);
    for (const task of this.visibleTasks()) map.get(task.columnId)?.push(task);
    map.forEach(tasks => tasks.sort((a, b) => a.position - b.position));
    return map;
  });

  readonly currentParentId = computed(() => this.parentStack().at(-1)?.id || null);
  readonly totalActive = computed(() => (this.board()?.tasks || []).filter(task => task.parentTaskId === this.currentParentId() && !task.archived).length);
  readonly overdueCount = computed(() => (this.board()?.tasks || []).filter(task => task.parentTaskId === this.currentParentId() && !task.archived && this.isOverdue(task)).length);
  readonly completedCount = computed(() => {
    const done = this.board()?.columns.find(column => column.title.toLocaleLowerCase('pt-BR').includes('conclu'));
    return done ? (this.board()?.tasks || []).filter(task => task.parentTaskId === this.currentParentId() && !task.archived && task.columnId === done.id).length : 0;
  });

  tasksFor(columnId: string): KanbanTask[] {
    return this.tasksByColumn().get(columnId) || [];
  }

  get dropListIds(): string[] { return (this.board()?.columns || []).map(column => column.id); }

  dropTask(event: CdkDragDrop<KanbanTask[]>, target: KanbanColumn): void {
    this.dragOverColumnId.set(null);
    const board = this.board();
    if (!board || this.showArchived()) return;
    const task = event.item.data as KanbanTask;
    if (!task || task.archived) return;
    const sourceId = task.columnId;
    const source = board.tasks.filter(item => !item.archived && item.parentTaskId === this.currentParentId() && item.columnId === sourceId).sort((a, b) => a.position - b.position);
    const destination = sourceId === target.id ? source : board.tasks.filter(item => !item.archived && item.parentTaskId === this.currentParentId() && item.columnId === target.id).sort((a, b) => a.position - b.position);

    if (sourceId === target.id) {
      const from = source.findIndex(item => item.id === task.id);
      if (from < 0) { this.service.loadBoard(board.id); return; }
      source.splice(event.currentIndex, 0, source.splice(from, 1)[0]);
    } else {
      const from = source.findIndex(item => item.id === task.id);
      if (from < 0) { this.service.loadBoard(board.id); return; }
      source.splice(from, 1);
      destination.splice(event.currentIndex, 0, { ...task, columnId: target.id });
    }

    const changed = [...source.map((item, position) => ({ ...item, columnId: sourceId, position })),
      ...(sourceId === target.id ? [] : destination.map((item, position) => ({ ...item, columnId: target.id, position })) )];
    const changedMap = new Map(changed.map(item => [item.id, item]));
    this.service.activeBoard.set({ ...board, tasks: board.tasks.map(item => changedMap.get(item.id) || item) });
    this.service.reorder(board.id, [], changed.map(item => ({ id: item.id, columnId: item.columnId, position: item.position })));
  }

  enterColumn(columnId: string): void {
    this.dragOverColumnId.set(columnId);
  }

  leaveColumn(columnId: string): void {
    if (this.dragOverColumnId() === columnId) this.dragOverColumnId.set(null);
  }

  moveColumn(column: KanbanColumn, direction: -1 | 1): void {
    const board = this.board();
    if (!board) return;
    const columns = [...board.columns].sort((a, b) => a.position - b.position);
    const index = columns.findIndex(item => item.id === column.id);
    const target = index + direction;
    if (target < 0 || target >= columns.length) return;
    [columns[index], columns[target]] = [columns[target], columns[index]];
    columns.forEach((item, position) => item.position = position);
    this.service.activeBoard.set({ ...board, columns });
    this.service.reorder(board.id, columns.map(item => item.id), []);
  }

  openCreate(columnId?: string): void {
    if (!this.openCreateDraft(columnId)) return;
    this.updateUrl({ acao: 'nova-tarefa', tarefa: null, lista: this.draft.columnId });
  }

  private openCreateDraft(columnId?: string): boolean {
    const first = columnId || this.board()?.columns[0]?.id;
    if (!first) return false;
    this.editingId.set(null);
    this.draft = this.emptyDraft(first, this.currentParentId());
    this.draftSector = this.board()?.teamName || this.currentTeam()?.name || '';
    this.draftMacroTheme = this.board()?.name || '';
    this.draftExecutionDate = '';
    this.draftOrder = '';
    this.draftNetworkPath = '';
    this.labelText = '';
    
    // Initialize custom fields
    this.draftCustomFields = {};
    for (const col of this.customColumns()) {
      this.draftCustomFields[col.id] = col.type === 'checkbox' ? false : '';
    }

    this.checklistText = '';
    this.checklistGroupTitle = '';
    this.activeChecklistGroup = undefined;
    this.customChecklistGroups = [];
    this.sectionItemDrafts = {};
    this.showAddSectionForm = false;
    this.showAddPropertyInModal.set(false);
    this.pendingFiles = [];
    this.attachmentError = '';
    this.modalOpen.set(true);
    return true;
  }

  closeTaskModal(): void {
    this.modalOpen.set(false);
    this.isTaskReadOnly.set(false);
    this.updateUrl({ tarefa: null, acao: null, lista: null });
  }

  openView(task: KanbanTask): void {
    this.isTaskReadOnly.set(true);
    this.openEditDraft(task);
    this.updateUrl({ tarefa: task.id, acao: null, lista: null });
  }

  openEdit(task: KanbanTask): void {
    this.isTaskReadOnly.set(false);
    this.openEditDraft(task);
    this.updateUrl({ tarefa: task.id, acao: null, lista: null });
  }

  enableTaskEditMode(): void {
    this.isTaskReadOnly.set(false);
  }

  toggleChecklistItemInView(item: { id?: string; text: string; done: boolean; groupTitle?: string }): void {
    item.done = !item.done;
    const id = this.editingId();
    if (id) {
      this.service.updateTask(id, { checklist: this.draft.checklist });
    }
  }

  onTaskDescriptionChangeInView(newDescription: string): void {
    this.draft.description = newDescription;
    const id = this.editingId();
    if (id) {
      this.service.updateTask(id, { description: newDescription });
    }
  }

  toggleCustomFieldInView(col: TableColumnDef): void {
    const current = !!this.draftCustomFields[col.id];
    const next = !current;
    this.draftCustomFields[col.id] = next;
    const task = this.board()?.tasks.find(t => t.id === this.editingId());
    if (task) {
      this.updateCustomField(task, col, next);
    }
  }

  private openEditDraft(task: KanbanTask): void {
    this.editingId.set(task.id);
    this.draft = {
      title: task.title, description: task.description, columnId: task.columnId, priority: task.priority,
      dueDate: task.dueDate, labels: [...task.labels], assigneeIds: [...task.assigneeIds],
      checklist: task.checklist.map(item => ({ ...item })), parentTaskId: task.parentTaskId,
    };
    this.draftSector = this.getSectorText(task);
    this.draftMacroTheme = this.getMacroTheme(task, false);
    this.draftExecutionDate = this.getExecutionDateRaw(task);
    this.draftOrder = this.getOrderText(task);
    this.draftNetworkPath = this.getNetworkPath(task);
    
    // Extract custom properties into draftCustomFields
    this.draftCustomFields = {};
    for (const col of this.customColumns()) {
      this.draftCustomFields[col.id] = this.getCustomFieldValue(task, col);
    }

    // Filter out structured tags from labelText for clean display in tags field
    const freeLabels = task.labels.filter(l => !l.startsWith('cx_') && !/^(setor|macro|exec|ped|pedido|rede):/i.test(l));
    this.labelText = freeLabels.join(', ');

    this.checklistText = '';
    this.checklistGroupTitle = '';
    this.activeChecklistGroup = undefined;
    const existingGroups = new Set<string>();
    task.checklist.forEach(item => {
      if (item.groupTitle) existingGroups.add(item.groupTitle);
    });
    this.customChecklistGroups = Array.from(existingGroups);
    this.sectionItemDrafts = {};
    this.showAddSectionForm = false;
    this.showAddPropertyInModal.set(false);
    this.pendingFiles = [];
    this.attachmentError = '';
    this.modalOpen.set(true);
  }

  saveTask(): void {
    const title = this.draft.title.trim();
    const board = this.board();
    if (!title || !board) return;
    this.draft.title = title;
    
    const manualLabels = this.labelText
      .split(',')
      .map(value => value.trim())
      .filter(value => Boolean(value) && !value.startsWith('cx_') && !/^(setor|macro|exec|ped|pedido|rede):/i.test(value));
    
    const finalLabels: string[] = [...manualLabels];

    // Collect custom properties
    for (const col of this.customColumns()) {
      const val = this.draftCustomFields[col.id];
      if (col.type === 'checkbox') {
        if (val) finalLabels.push(`cx_${col.id}:true`);
      } else if (val !== undefined && val !== null && String(val).trim() !== '') {
        finalLabels.push(`cx_${col.id}:${String(val).trim()}`);
      }
    }

    // Retain legacy tags if fields are filled
    if (this.draftSector) finalLabels.push(`setor:${this.draftSector}`);
    if (this.draftMacroTheme) finalLabels.push(`macro:${this.draftMacroTheme}`);
    if (this.draftExecutionDate) finalLabels.push(`exec:${this.draftExecutionDate}`);
    if (this.draftOrder) finalLabels.push(`ped:${this.draftOrder}`);
    if (this.draftNetworkPath) finalLabels.push(`rede:${this.draftNetworkPath}`);

    this.draft.labels = finalLabels.slice(0, 30);
    const editing = this.editingId();
    this.savingTask.set(true);
    const completed = (task: KanbanTask | null) => {
      if (!task) { this.savingTask.set(false); return; }
      this.uploadPending(task, success => {
        this.savingTask.set(false);
        if (success) this.closeTaskModal();
      });
    };
    if (editing) this.service.updateTask(editing, this.draft, completed);
    else this.service.createTask(board.id, this.draft, completed);
  }

  archiveTask(task: KanbanTask): void {
    this.savingTask.set(true);
    this.service.updateTask(task.id, { archived: !task.archived }, success => {
      this.savingTask.set(false);
      if (success) this.closeTaskModal();
    });
  }

  archiveEditing(): void {
    const task = this.board()?.tasks.find(item => item.id === this.editingId());
    if (task) this.archiveTask(task);
  }

  deleteEditing(): void {
    const task = this.board()?.tasks.find(item => item.id === this.editingId());
    if (task) this.requestTaskDeletion(task);
  }

  canDeleteTasks(): boolean {
    return this.board()?.myRole === 'admin';
  }

  requestTaskDeletion(task: KanbanTask): void {
    this.closeTaskContextMenu();
    if (this.canDeleteTasks()) this.taskDeleteTarget.set(task);
  }

  cancelTaskDeletion(): void {
    if (this.taskDeleteLoading()) return;
    this.taskDeleteTarget.set(null);
  }

  confirmTaskDeletion(): void {
    const task = this.taskDeleteTarget();
    if (!task || !this.canDeleteTasks()) return;
    this.taskDeleteLoading.set(true);
    this.service.deleteTask(task.id, success => {
      this.taskDeleteLoading.set(false);
      if (!success) return;
      this.taskDeleteTarget.set(null);
      if (this.editingId() === task.id) this.closeTaskModal();
    });
  }

  openTrash(): void {
    const board = this.board();
    if (!board) return;
    this.permanentDeleteTarget.set(null);
    this.trashOpen.set(true);
    this.service.loadTrash(board.id);
  }

  closeTrash(): void {
    if (this.trashActionLoading()) return;
    this.permanentDeleteTarget.set(null);
    this.trashOpen.set(false);
  }

  restoreFromTrash(task: KanbanTask): void {
    if (!this.canDeleteTasks()) return;
    this.trashActionLoading.set(true);
    this.service.restoreTask(task.id, success => {
      this.trashActionLoading.set(false);
      if (success && this.service.trash().length <= 1) this.trashOpen.set(false);
    });
  }

  requestPermanentDeletion(task: KanbanTask): void {
    if (this.canDeleteTasks()) this.permanentDeleteTarget.set(task);
  }

  confirmPermanentDeletion(): void {
    const task = this.permanentDeleteTarget();
    if (!task || !this.canDeleteTasks()) return;
    this.trashActionLoading.set(true);
    this.service.permanentlyDeleteTask(task.id, success => {
      this.trashActionLoading.set(false);
      if (success) this.permanentDeleteTarget.set(null);
    });
  }

  trashDaysRemaining(task: KanbanTask): number {
    if (!task.deletedAt) return 0;
    const expiresAt = new Date(task.deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000;
    return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
  }

  formatTrashDate(task: KanbanTask): string {
    return task.deletedAt ? new Date(task.deletedAt).toLocaleDateString('pt-BR') : '';
  }

  addChecklistItem(): void {
    const text = this.checklistText.trim();
    if (!text) return;
    this.draft.checklist.push({
      id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      text,
      done: false,
      groupTitle: this.activeChecklistGroup,
    });
    this.checklistText = '';
  }

  addChecklistItemToGroup(groupTitle?: string, text?: string): void {
    const itemText = (text !== undefined ? text : (groupTitle ? (this.sectionItemDrafts[groupTitle] || '') : this.checklistText)).trim();
    if (!itemText) return;
    this.draft.checklist.push({
      id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      text: itemText,
      done: false,
      groupTitle: groupTitle || undefined,
    });
    if (groupTitle) {
      this.sectionItemDrafts[groupTitle] = '';
    } else {
      this.checklistText = '';
    }
  }

  addChecklistGroup(customTitle?: string): void {
    const title = (customTitle || this.checklistGroupTitle).trim();
    if (!title) return;
    if (!this.customChecklistGroups.includes(title)) {
      this.customChecklistGroups.push(title);
    }
    this.activeChecklistGroup = title;
    this.checklistGroupTitle = '';
    this.showAddSectionForm = true;
  }

  removeChecklistGroup(groupTitle: string): void {
    this.draft.checklist = this.draft.checklist.filter(item => item.groupTitle !== groupTitle);
    this.customChecklistGroups = this.customChecklistGroups.filter(g => g !== groupTitle);
    delete this.sectionItemDrafts[groupTitle];
    if (this.activeChecklistGroup === groupTitle) this.activeChecklistGroup = undefined;
  }

  setActiveGroup(groupTitle: string | undefined): void {
    this.activeChecklistGroup = groupTitle;
  }

  /** Returns unique group titles in the order created or present in checklist */
  get checklistGroups(): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const group of this.customChecklistGroups) {
      if (group && !seen.has(group)) {
        seen.add(group);
        result.push(group);
      }
    }
    for (const item of this.draft.checklist) {
      if (item.groupTitle && !seen.has(item.groupTitle)) {
        seen.add(item.groupTitle);
        result.push(item.groupTitle);
      }
    }
    return result;
  }

  /** Ungrouped items (no groupTitle) */
  get ungroupedChecklistItems() {
    return this.draft.checklist.filter(item => !item.groupTitle);
  }

  checklistItemsForGroup(groupTitle: string) {
    return this.draft.checklist.filter(item => item.groupTitle === groupTitle);
  }

  groupProgress(groupTitle: string): { done: number; total: number } {
    const items = this.checklistItemsForGroup(groupTitle);
    return { done: items.filter(i => i.done).length, total: items.length };
  }

  removeChecklistItem(index: number): void { this.draft.checklist.splice(index, 1); }

  get taskAttachments(): Attachment[] {
    return this.board()?.tasks.find(task => task.id === this.editingId())?.attachments || [];
  }

  selectTaskFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const available = Math.max(0, 10 - this.taskAttachments.length - this.pendingFiles.length);
    const selected = [...(input.files || [])].slice(0, available);
    const tooLarge = selected.find(file => file.size > 10 * 1024 * 1024);
    this.attachmentError = tooLarge ? `${tooLarge.name} excede o limite de 10 MB.` : '';
    this.pendingFiles.push(...selected.filter(file => file.size <= 10 * 1024 * 1024));
    input.value = '';
  }

  removePendingFile(index: number): void { this.pendingFiles.splice(index, 1); }

  getFileInfo(name: string, mime?: string) {
    return detectFileType(name, mime);
  }

  openTaskAttachment(attachment: Attachment): void {
    const uid = this.auth.currentUser()?.id || '';
    const fileInfo = detectFileType(attachment.fileName, attachment.mimeType);
    this.closeAttachmentPreview();
    this.attachmentPreviewCurrent.set(attachment);
    this.attachmentPreviewName.set(attachment.fileName);
    this.attachmentPreviewMimeType.set(attachment.mimeType);
    this.attachmentPreviewByteSize.set(attachment.byteSize);

    if (fileInfo.category === 'code' || fileInfo.category === 'other' || attachment.mimeType.startsWith('text/')) {
      this.attachmentsService.text(attachment.id, uid).subscribe({
        next: (text) => {
          this.attachmentPreviewRawContent.set(text);
          this.attachmentsService.content(attachment.id, uid).subscribe({
            next: blob => this.attachmentPreviewUrl.set(URL.createObjectURL(blob)),
            error: () => this.attachmentError = 'Não foi possível carregar o anexo.',
          });
        },
        error: () => {
          this.attachmentsService.content(attachment.id, uid).subscribe({
            next: blob => this.attachmentPreviewUrl.set(URL.createObjectURL(blob)),
            error: () => this.attachmentError = 'Não foi possível carregar o anexo.',
          });
        }
      });
    } else {
      this.attachmentPreviewRawContent.set(null);
      this.attachmentsService.content(attachment.id, uid).subscribe({
        next: blob => this.attachmentPreviewUrl.set(URL.createObjectURL(blob)),
        error: () => this.attachmentError = 'Não foi possível abrir o anexo.',
      });
    }
  }

  openPendingFile(file: File): void {
    const fileInfo = detectFileType(file.name, file.type);
    this.closeAttachmentPreview();
    this.attachmentPreviewCurrent.set(null);
    this.attachmentPreviewName.set(file.name);
    this.attachmentPreviewMimeType.set(file.type || '');
    this.attachmentPreviewByteSize.set(file.size);

    if (fileInfo.category === 'code' || file.type.startsWith('text/')) {
      file.text().then(text => {
        this.attachmentPreviewRawContent.set(text);
        this.attachmentPreviewUrl.set(URL.createObjectURL(file));
      }).catch(() => {
        this.attachmentPreviewUrl.set(URL.createObjectURL(file));
      });
    } else {
      this.attachmentPreviewRawContent.set(null);
      this.attachmentPreviewUrl.set(URL.createObjectURL(file));
    }
  }

  closeAttachmentPreview(): void {
    const url = this.attachmentPreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.attachmentPreviewUrl.set(null);
    this.attachmentPreviewName.set('');
    this.attachmentPreviewMimeType.set('');
    this.attachmentPreviewRawContent.set(null);
    this.attachmentPreviewByteSize.set(undefined);
    this.attachmentPreviewCurrent.set(null);
    this.trustedAttachmentPreviewUrl.set(null);
  }

  downloadTaskAttachment(att?: Attachment | null): void {
    const target = att || this.attachmentPreviewCurrent();
    if (!target) return;
    const uid = this.auth.currentUser()?.id || '';
    this.attachmentsService.download(target, uid);
  }

  deleteTaskAttachment(attachment: Attachment): void {
    const uid = this.auth.currentUser()?.id || '';
    this.attachmentsService.remove(attachment.id, uid).subscribe({
      next: () => this.service.setTaskAttachments(this.editingId() || '', this.taskAttachments.filter(item => item.id !== attachment.id)),
      error: error => this.attachmentError = error.error?.error || 'Não foi possível excluir o anexo.',
    });
  }

  private uploadPending(task: KanbanTask, onComplete: (success: boolean) => void): void {
    if (!this.pendingFiles.length) return onComplete(true);
    const uid = this.auth.currentUser()?.id || '';
    forkJoin(this.pendingFiles.map(file => this.attachmentsService.upload('task', task.id, file, uid))).subscribe({
      next: uploaded => {
        this.service.setTaskAttachments(task.id, [...(task.attachments || []), ...uploaded]);
        this.pendingFiles = [];
        onComplete(true);
      },
      error: error => {
        this.attachmentError = error.error?.error || 'A tarefa foi salva, mas não foi possível enviar todos os anexos.';
        onComplete(false);
      },
    });
  }

  saveColumn(): void {
    const title = this.newColumnTitle.trim();
    const color = this.newColumnColor;
    const autoArchiveDelay = this.newColumnAutoArchiveDelay;
    const board = this.board();
    if (title && board) this.service.createColumn(board.id, title, color, autoArchiveDelay);
    this.newColumnTitle = '';
    this.newColumnColor = '#64748b';
    this.newColumnAutoArchiveDelay = 'never';
    this.addingColumn.set(false);
  }

  toggleColumnMenu(columnId: string, event: Event): void {
    event.stopPropagation();
    this.columnMenuId.set(this.columnMenuId() === columnId ? null : columnId);
  }

  openColumnDialog(column: KanbanColumn, action: 'rename' | 'delete'): void {
    this.selectedColumn.set(column);
    this.columnTitleDraft = column.title;
    this.columnColorDraft = column.color || '#64748b';
    this.columnAutoArchiveDelayDraft = column.autoArchiveDelay || 'never';
    this.columnDialog.set(action);
    this.columnMenuId.set(null);
  }

  closeColumnDialog(): void {
    this.columnDialog.set(null);
    this.selectedColumn.set(null);
    this.columnTitleDraft = '';
    this.columnColorDraft = '#64748b';
    this.columnAutoArchiveDelayDraft = 'never';
  }

  confirmColumnDialog(): void {
    const column = this.selectedColumn();
    const action = this.columnDialog();
    if (!column || !action) return;
    if (action === 'rename') {
      const title = this.columnTitleDraft.trim();
      const color = this.columnColorDraft;
      const autoArchiveDelay = this.columnAutoArchiveDelayDraft;
      if (!title) return;
      if (title !== column.title || color !== column.color || autoArchiveDelay !== (column.autoArchiveDelay || 'never')) {
        this.service.updateColumn(column.id, { title, color, autoArchiveDelay });
      }
    } else {
      if (this.columnHasActiveTasks(column.id)) return;
      this.service.deleteColumn(column.id);
    }
    this.closeColumnDialog();
  }

  columnHasActiveTasks(columnId: string): boolean {
    return (this.board()?.tasks || []).some(task => task.columnId === columnId && !task.archived);
  }

  saveBoard(): void {
    const name = this.newBoardName.trim();
    if (name) this.service.createTeam(name, this.newTeamDescription.trim(), this.newTeamColor);
    this.newBoardName = '';
    this.newTeamDescription = '';
    this.addingBoard.set(false);
    this.creatingTeam.set(false);
    this.teamModalOpen.set(false);
  }

  switchBoard(boardId: string): void {
    // Atualiza a rota mesmo quando o quadro já está em memória. Isso é
    // importante após cargas assíncronas, quando a tela pode estar no quadro
    // correto mas o endereço ainda aponta para o quadro anterior.
    const boardChanged = this.board()?.id !== boardId;
    void this.router.navigate(['/tarefas', boardId]);
    if (!boardChanged) return;
    this.trashOpen.set(false);
    this.service.trash.set([]);
    this.parentStack.set([]);
    this.showArchived.set(false);
    const team = this.teams().find(item => item.boardId === boardId);
    if (team) this.service.loadTeamMembers(team.id);
    else this.service.teamMembers.set([]);
    this.service.loadBoard(boardId);
  }

  openTeamContextMenu(event: MouseEvent, team: KanbanTeam): void {
    if (team.myRole !== 'admin') return;
    event.preventDefault();
    event.stopPropagation();
    this.taskContextMenu.set(null);
    this.teamContextMenu.set({
      team,
      x: Math.min(event.clientX, window.innerWidth - 198),
      y: Math.min(event.clientY, window.innerHeight - 56),
    });
  }

  closeTeamContextMenu(): void {
    this.teamContextMenu.set(null);
  }

  openTaskContextMenu(event: MouseEvent, task: KanbanTask): void {
    event.preventDefault();
    event.stopPropagation();
    this.teamContextMenu.set(null);
    const menuHeight = this.canDeleteTasks() ? 184 : 144;
    this.taskContextMenu.set({
      task,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 206)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    });
  }

  closeTaskContextMenu(): void {
    this.taskContextMenu.set(null);
  }

  closeContextMenus(): void {
    this.closeTeamContextMenu();
    this.closeTaskContextMenu();
    this.showSortMenu.set(false);
    this.showColumnManager.set(false);
    this.showFilterMenu.set(false);
    this.showMoreMenu.set(false);
  }

  viewTaskFromContext(task: KanbanTask): void {
    this.closeTaskContextMenu();
    this.openView(task);
  }

  editTaskFromContext(task: KanbanTask): void {
    this.closeTaskContextMenu();
    this.openEdit(task);
  }

  openTaskBranchFromContext(task: KanbanTask): void {
    this.closeTaskContextMenu();
    this.openChildBoard(task);
  }

  toggleTaskArchiveFromContext(task: KanbanTask): void {
    this.closeTaskContextMenu();
    this.archiveTask(task);
  }

  deleteTaskFromContext(task: KanbanTask): void {
    this.requestTaskDeletion(task);
  }

  requestTeamDeletion(team: KanbanTeam): void {
    this.closeTeamContextMenu();
    if (team.myRole === 'admin') this.teamDeleteTarget.set(team);
  }

  cancelTeamDeletion(): void {
    if (this.teamDeleteLoading()) return;
    this.teamDeleteTarget.set(null);
  }

  confirmTeamDeletion(): void {
    const team = this.teamDeleteTarget();
    if (!team || team.myRole !== 'admin') return;
    this.teamDeleteLoading.set(true);
    this.service.deleteTeam(team.id, success => {
      this.teamDeleteLoading.set(false);
      if (success) {
        this.teamDeleteTarget.set(null);
        this.teamModalOpen.set(false);
      }
    });
  }

  personalBoardId(): string | undefined {
    return this.boards().find(board => board.scopeType !== 'team')?.id;
  }

  openTeamManager(team?: KanbanTeam): void {
    const selected = team || this.teams().find(item => item.id === this.board()?.teamId) || this.teams()[0];
    if (selected) this.service.loadTeamMembers(selected.id);
    this.teamModalOpen.set(true);
    this.creatingTeam.set(!selected);
  }

  currentTeam(): KanbanTeam | undefined {
    return this.teams().find(team => team.id === this.board()?.teamId) || this.teams()[0];
  }

  inviteMember(): void {
    const team = this.currentTeam();
    if (!team || !this.invitedUserId) return;
    this.service.inviteToTeam(team.id, this.invitedUserId);
    this.invitedUserId = '';
  }

  removeMember(memberId: string): void {
    const member = this.service.teamMembers().find(item => item.id === memberId);
    if (member) this.memberRemovalTarget.set(member);
  }

  cancelMemberRemoval(): void {
    this.memberRemovalTarget.set(null);
  }

  confirmMemberRemoval(): void {
    const team = this.currentTeam();
    const member = this.memberRemovalTarget();
    if (!team || !member) return;
    this.service.removeTeamMember(team.id, member.id);
    this.memberRemovalTarget.set(null);
  }

  changeMemberRole(memberId: string, role: 'admin' | 'member'): void {
    const team = this.currentTeam();
    if (!team) return;
    this.service.changeTeamMemberRole(team.id, memberId, role);
  }

  isTeamOwner(userId: string): boolean {
    return this.currentTeam()?.owner_id === userId;
  }

  removeTeam(): void {
    const team = this.currentTeam();
    if (team?.myRole === 'admin') this.requestTeamDeletion(team);
  }

  memberName(userId: string): string {
    if (userId === this.auth.currentUser()?.id) return this.auth.currentUser()?.name || 'Você';
    return this.auth.allUsers().find(user => user.id === userId)?.name || userId;
  }

  memberAvatar(userId: string): string {
    if (userId === this.auth.currentUser()?.id) return this.auth.currentUser()?.avatar || this.defaultAvatar;
    return this.auth.allUsers().find(user => user.id === userId)?.avatar || this.defaultAvatar;
  }

  assignableUsers() {
    if (this.board()?.scopeType !== 'team') return [];
    const memberIds = new Set(this.service.teamMembers().map(member => member.user_id));
    return this.auth.allUsers()
      .filter(user => memberIds.has(user.id) && user.id !== this.auth.currentUser()?.id)
      .sort((first, second) => (first.name || first.email || '').localeCompare(
        second.name || second.email || '', 'pt-BR', { sensitivity: 'base' }
      ));
  }

  childCount(task: KanbanTask): number {
    return (this.board()?.tasks || []).filter(item => item.parentTaskId === task.id && !item.archived).length;
  }

  branchHasContent(task: KanbanTask): boolean {
    return (this.board()?.tasks || []).some(item => item.parentTaskId === task.id);
  }

  openChildBoard(task: KanbanTask, event?: Event): void {
    event?.stopPropagation();
    if (!this.branchHasContent(task)) {
      this.branchConfirmationTask.set(task);
      return;
    }
    this.enterChildBoard(task);
  }

  cancelBranchCreation(): void {
    this.branchConfirmationTask.set(null);
  }

  confirmBranchCreation(): void {
    const task = this.branchConfirmationTask();
    if (!task) return;
    this.branchConfirmationTask.set(null);
    this.enterChildBoard(task);
  }

  private enterChildBoard(task: KanbanTask): void {
    this.parentStack.update(stack => [...stack, task]);
    this.modalOpen.set(false);
    this.showArchived.set(false);
    this.updateUrl({ ramificacao: task.id, tarefa: null, acao: null, arquivadas: null });
  }

  openEditingChildBoard(): void {
    const task = this.board()?.tasks.find(item => item.id === this.editingId());
    if (task) this.openChildBoard(task);
  }

  navigateTree(level: number): void {
    this.parentStack.update(stack => level < 0 ? [] : stack.slice(0, level + 1));
    this.showArchived.set(false);
    this.updateUrl({ ramificacao: this.currentParentId(), tarefa: null, acao: null, arquivadas: null });
  }

  setSearch(value: string): void {
    this.search.set(value);
    this.updateUrl({ busca: value.trim() || null }, true);
  }

  setPriorityFilter(value: TaskPriority | 'all'): void {
    this.priorityFilter.set(value);
    this.updateUrl({ prioridade: value === 'all' ? null : value });
  }

  setAssigneeFilter(value: string): void {
    this.assigneeFilter.set(value);
    this.updateUrl({ responsavel: value === 'all' ? null : value });
  }

  toggleArchived(): void {
    this.showArchived.update(value => !value);
    this.updateUrl({ arquivadas: this.showArchived() ? '1' : null });
  }

  renameBoard(): void {
    const board = this.board();
    if (!board) return;
    this.boardNameDraft = board.name;
    this.boardNameDialogOpen.set(true);
  }

  closeBoardNameDialog(): void {
    this.boardNameDialogOpen.set(false);
    this.boardNameDraft = '';
  }

  confirmBoardName(): void {
    const board = this.board();
    const name = this.boardNameDraft.trim();
    if (!board || !name) return;
    if (name !== board.name) this.service.updateBoard(board.id, { name });
    this.closeBoardNameDialog();
  }

  removeBoard(): void {
    const board = this.board();
    if (board && confirm(`Excluir o quadro “${board.name}” e todas as tarefas? Esta ação não pode ser desfeita.`)) this.service.deleteBoard(board.id);
  }

  assigneeName(id: string | null): string {
    if (!id) return '';
    if (id === this.auth.currentUser()?.id) return this.auth.currentUser()?.name || '';
    return this.auth.allUsers().find(user => user.id === id)?.name || 'Colaborador';
  }

  assigneeAvatar(id: string | null): string {
    if (id === this.auth.currentUser()?.id) return this.auth.currentUser()?.avatar || this.defaultAvatar;
    return this.auth.allUsers().find(user => user.id === id)?.avatar || this.defaultAvatar;
  }

  toggleDraftAssignee(userId: string): void {
    const index = this.draft.assigneeIds.indexOf(userId);
    if (index >= 0) this.draft.assigneeIds.splice(index, 1);
    else this.draft.assigneeIds.push(userId);
  }

  isDraftAssignee(userId: string): boolean { return this.draft.assigneeIds.includes(userId); }

  checklistProgress(task: KanbanTask): number {
    if (!task.checklist.length) return 0;
    return Math.round(task.checklist.filter(item => item.done).length / task.checklist.length * 100);
  }

  isChecklistExpanded(taskId: string): boolean {
    return this.expandedChecklistIds().has(taskId);
  }

  toggleCardChecklist(taskId: string, event: Event): void {
    event.stopPropagation();
    this.expandedChecklistIds.update(current => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  toggleCardChecklistItem(task: KanbanTask, itemId: string, event: Event): void {
    event.stopPropagation();
    const done = (event.target as HTMLInputElement).checked;
    const checklist = task.checklist.map(item => item.id === itemId ? { ...item, done } : { ...item });
    this.service.updateTask(task.id, { checklist });
  }

  isOverdue(task: KanbanTask): boolean {
    if (!task.dueDate) return false;
    return new Date(`${task.dueDate}T23:59:59`).getTime() < Date.now();
  }

  isDueSoon(task: KanbanTask): boolean {
    if (!task.dueDate || this.isOverdue(task)) return false;
    const diff = new Date(`${task.dueDate}T23:59:59`).getTime() - Date.now();
    return diff < 3 * 86400000;
  }

  formatDate(date: string | null): string {
    return date ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00`)) : '';
  }

  setViewMode(mode: 'kanban' | 'list'): void {
    this.viewMode.set(mode);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dc_kanban_view_mode', mode);
    }
  }

  toggleSortMenu(event?: Event): void {
    if (event) event.stopPropagation();
    this.showSortMenu.update(v => !v);
    if (this.showSortMenu()) {
      this.showColumnManager.set(false);
      this.showFilterMenu.set(false);
      this.showMoreMenu.set(false);
    }
  }

  toggleFilterMenu(event?: Event): void {
    if (event) event.stopPropagation();
    this.showFilterMenu.update(v => !v);
    if (this.showFilterMenu()) {
      this.showSortMenu.set(false);
      this.showColumnManager.set(false);
      this.showMoreMenu.set(false);
    }
  }

  toggleMoreMenu(event?: Event): void {
    if (event) event.stopPropagation();
    this.showMoreMenu.update(v => !v);
    if (this.showMoreMenu()) {
      this.showSortMenu.set(false);
      this.showColumnManager.set(false);
      this.showFilterMenu.set(false);
    }
  }

  clearFilters(event?: Event): void {
    if (event) event.stopPropagation();
    this.setPriorityFilter('all');
    this.setAssigneeFilter('all');
  }

  toggleSort(option: 'default' | 'dueDate' | 'priority' | 'title' | 'status'): void {
    if (this.sortOption() === option) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortOption.set(option);
      this.sortDirection.set('asc');
    }
    this.showSortMenu.set(false);
  }

  private loadInitialColumnWidths(): Record<string, number> {
    const defaults = { ...this.defaultTableWidths };
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('dc_table_column_widths');
        if (saved) {
          const parsed = JSON.parse(saved);
          return { ...defaults, ...parsed };
        }
      } catch {}
    }
    return defaults;
  }

  private loadInitialKanbanColumnWidths(): Record<string, number> {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('dc_kanban_column_widths');
        if (saved) {
          return JSON.parse(saved);
        }
      } catch {}
    }
    return {};
  }

  getColumnWidth(colId: string): number {
    return this.columnWidths()[colId] || this.defaultTableWidths[colId] || 150;
  }

  getKanbanColumnWidth(colId: string): number {
    return this.kanbanColumnWidths()[colId] || this.defaultKanbanColumnWidth;
  }

  onColumnResizeStart(event: MouseEvent, colId: string): void {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = this.getColumnWidth(colId);
    const minWidth = colId === 'subject' || colId === 'demand' ? 100 : 70;

    this.resizingColumnId.set(colId);
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    this.cleanupResizeListeners();

    this.resizeMoveListener = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(minWidth, Math.min(800, Math.round(startWidth + diff)));
      this.columnWidths.update(widths => ({ ...widths, [colId]: newWidth }));
    };

    this.resizeUpListener = () => {
      this.resizingColumnId.set(null);
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      this.cleanupResizeListeners();
      this.saveColumnWidths();
    };

    window.addEventListener('mousemove', this.resizeMoveListener);
    window.addEventListener('mouseup', this.resizeUpListener);
  }

  resetColumnWidth(colId: string, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const def = this.defaultTableWidths[colId] || 150;
    this.columnWidths.update(widths => ({ ...widths, [colId]: def }));
    this.saveColumnWidths();
  }

  private saveColumnWidths(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('dc_table_column_widths', JSON.stringify(this.columnWidths()));
    } catch {}
  }

  onKanbanColumnResizeStart(event: MouseEvent, colId: string): void {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = this.getKanbanColumnWidth(colId);
    const minWidth = 220;
    const maxWidth = 700;

    this.resizingColumnId.set(`kanban_${colId}`);
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    this.cleanupResizeListeners();

    this.resizeMoveListener = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, Math.round(startWidth + diff)));
      this.kanbanColumnWidths.update(widths => ({ ...widths, [colId]: newWidth }));
    };

    this.resizeUpListener = () => {
      this.resizingColumnId.set(null);
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      this.cleanupResizeListeners();
      this.saveKanbanColumnWidths();
    };

    window.addEventListener('mousemove', this.resizeMoveListener);
    window.addEventListener('mouseup', this.resizeUpListener);
  }

  resetKanbanColumnWidth(colId: string, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.kanbanColumnWidths.update(widths => {
      const updated = { ...widths };
      delete updated[colId];
      return updated;
    });
    this.saveKanbanColumnWidths();
  }

  private saveKanbanColumnWidths(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('dc_kanban_column_widths', JSON.stringify(this.kanbanColumnWidths()));
    } catch {}
  }

  private cleanupResizeListeners(): void {
    if (this.resizeMoveListener) {
      window.removeEventListener('mousemove', this.resizeMoveListener);
      this.resizeMoveListener = null;
    }
    if (this.resizeUpListener) {
      window.removeEventListener('mouseup', this.resizeUpListener);
      this.resizeUpListener = null;
    }
  }

  private loadInitialTableColumns(): TableColumnDef[] {
    let customCols: TableColumnDef[] = [];
    if (typeof localStorage !== 'undefined') {
      try {
        const savedCustom = localStorage.getItem('dc_table_custom_columns');
        if (savedCustom) {
          customCols = JSON.parse(savedCustom);
        }
      } catch {
        customCols = [];
      }
    }

    const allBase = [...DEFAULT_TABLE_COLUMNS, ...customCols];

    if (typeof localStorage !== 'undefined') {
      try {
        const savedVis = localStorage.getItem('dc_table_visible_columns');
        if (savedVis) {
          const parsedVis = JSON.parse(savedVis) as Record<string, boolean>;
          return allBase.map(col => ({
            ...col,
            visible: parsedVis[col.id] !== undefined ? parsedVis[col.id] : col.visible,
          }));
        }
      } catch {}
    }
    return allBase;
  }

  saveTableColumnsState(): void {
    if (typeof localStorage === 'undefined') return;
    const current = this.tableColumns();
    const custom = current.filter(c => c.isCustom);
    localStorage.setItem('dc_table_custom_columns', JSON.stringify(custom));
    const visMap: Record<string, boolean> = {};
    current.forEach(c => (visMap[c.id] = c.visible));
    localStorage.setItem('dc_table_visible_columns', JSON.stringify(visMap));
  }

  addCustomColumn(label?: string, type?: ColumnFieldType, optionsStr?: string): void {
    const colLabel = (label || this.newCustomColumnLabel).trim();
    if (!colLabel) return;
    const colType = type || this.newCustomColumnType || 'text';
    const id = 'col_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    
    let icon = 'text_fields';
    if (colType === 'date') icon = 'calendar_today';
    else if (colType === 'number') icon = 'tag';
    else if (colType === 'select') icon = 'list';
    else if (colType === 'checkbox') icon = 'check_box';
    else if (colType === 'person') icon = 'person';

    const options = (optionsStr !== undefined ? optionsStr : this.newCustomColumnOptions)
      ? (optionsStr !== undefined ? optionsStr : this.newCustomColumnOptions).split(',').map(o => o.trim()).filter(Boolean)
      : undefined;

    const newCol: TableColumnDef = {
      id,
      label: colLabel,
      icon,
      visible: true,
      type: colType,
      options,
      isCustom: true,
    };

    const updated = [...this.tableColumns(), newCol];
    this.tableColumns.set(updated);
    this.saveTableColumnsState();

    this.newCustomColumnLabel = '';
    this.newCustomColumnType = 'text';
    this.newCustomColumnOptions = '';
    this.showAddColumnPopover.set(false);
  }

  addPropertyInModal(): void {
    const label = this.newPropertyLabelInModal.trim();
    if (!label) return;
    this.addCustomColumn(label, this.newPropertyTypeInModal, this.newPropertyOptionsInModal);
    this.newPropertyLabelInModal = '';
    this.newPropertyTypeInModal = 'text';
    this.newPropertyOptionsInModal = '';
    this.showAddPropertyInModal.set(false);
  }

  openDatePicker(inputEl: HTMLInputElement | null, event?: Event): void {
    if (event) event.stopPropagation();
    if (!inputEl) return;
    try {
      if (typeof inputEl.showPicker === 'function') {
        inputEl.showPicker();
      } else {
        inputEl.focus();
      }
    } catch {
      inputEl.focus();
    }
  }

  openDatePickerFromCell(event: Event): void {
    event.stopPropagation();
    const cell = event.currentTarget as HTMLElement;
    const input = cell.querySelector<HTMLInputElement>('input[type="date"]');
    if (!input) return;
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.click();
        input.focus();
      }
    } catch {
      input.click();
      input.focus();
    }
  }

  isCustomColumn(col: TableColumnDef): boolean {
    return !!col.isCustom || col.id.startsWith('col_') || !DEFAULT_TABLE_COLUMNS.some(d => d.id === col.id);
  }

  removeCustomColumn(colId: string, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const target = this.tableColumns().find(c => c.id === colId);
    if (!target) return;

    // Remove from tableColumns
    const updated = this.tableColumns().filter(c => c.id !== colId);
    this.tableColumns.set(updated);
    this.saveTableColumnsState();

    // Clean up columnWidths from localStorage
    this.columnWidths.update(widths => {
      const next = { ...widths };
      delete next[colId];
      return next;
    });
    this.saveColumnWidths();

    // Clean up task custom labels if any
    const board = this.board();
    if (board) {
      const prefix = `cx_${colId}:`;
      const simplePrefix = `${colId}:`;
      const updatedTasks = board.tasks.map(t => {
        if (!t.labels || !t.labels.some(l => l.startsWith(prefix) || l.startsWith(simplePrefix))) {
          return t;
        }
        return {
          ...t,
          labels: t.labels.filter(l => !l.startsWith(prefix) && !l.startsWith(simplePrefix)),
        };
      });
      this.service.activeBoard.set({ ...board, tasks: updatedTasks });
    }
  }

  isColumnVisible(colId: string): boolean {
    const col = this.tableColumns().find(c => c.id === colId);
    return col ? col.visible : true;
  }

  toggleColumnVisibility(colId: string, event?: Event): void {
    if (event) event.stopPropagation();
    const current = this.tableColumns();
    const target = current.find(c => c.id === colId);
    if (!target) return;

    if (target.visible && this.visibleColumnsCount() <= 1) {
      return;
    }

    const updated = current.map(col => {
      if (col.id === colId) {
        return { ...col, visible: !col.visible };
      }
      return col;
    });

    this.tableColumns.set(updated);
    this.saveTableColumnsState();
  }

  setAllColumnsVisibility(visible: boolean, event?: Event): void {
    if (event) event.stopPropagation();
    const updated = this.tableColumns().map(col => ({
      ...col,
      visible: !visible && col.id === 'subject' ? true : visible,
    }));
    this.tableColumns.set(updated);
    this.saveTableColumnsState();
  }

  toggleColumnManager(event?: Event): void {
    if (event) event.stopPropagation();
    this.showColumnManager.update(v => !v);
    if (this.showColumnManager()) {
      this.showSortMenu.set(false);
      this.showFilterMenu.set(false);
      this.showMoreMenu.set(false);
    }
  }

  getCustomFieldValue(task: KanbanTask, col: TableColumnDef): any {
    if (!task || !task.labels) return col.type === 'checkbox' ? false : '';
    const prefix = `cx_${col.id}:`;
    const labelMatch = task.labels.find(l => l.startsWith(prefix));
    if (labelMatch) {
      const val = labelMatch.substring(prefix.length);
      if (col.type === 'checkbox') return val === 'true';
      return val;
    }
    const simpleMatch = task.labels.find(l => l.startsWith(`${col.id}:`));
    if (simpleMatch) {
      const val = simpleMatch.substring(col.id.length + 1);
      if (col.type === 'checkbox') return val === 'true';
      return val;
    }
    if (col.type === 'checkbox') return false;
    return '';
  }

  updateCustomField(task: KanbanTask, col: TableColumnDef, value: any, event?: Event): void {
    if (event) event.stopPropagation();
    const board = this.board();
    if (!board) return;

    const prefix = `cx_${col.id}:`;
    const simplePrefix = `${col.id}:`;
    const cleanLabels = (task.labels || []).filter(l => !l.startsWith(prefix) && !l.startsWith(simplePrefix));

    const stringVal = col.type === 'checkbox'
      ? (value ? 'true' : 'false')
      : (typeof value === 'string' ? value.trim() : (value !== null && value !== undefined ? String(value) : ''));

    if (stringVal && stringVal !== 'false') {
      cleanLabels.push(`${prefix}${stringVal}`);
    }

    this.service.updateTask(task.id, { labels: cleanLabels.slice(0, 30) });
  }

  toggleCustomCheckbox(task: KanbanTask, col: TableColumnDef, event?: Event): void {
    if (event) event.stopPropagation();
    const current = !!this.getCustomFieldValue(task, col);
    this.updateCustomField(task, col, !current);
  }

  startInlineEdit(task: KanbanTask, field: string, event?: Event): void {
    if (event) event.stopPropagation();
    let initial = '';
    if (field === 'title') initial = task.title;
    else if (field === 'demand') initial = task.description || '';
    else if (field === 'labels') initial = this.getTaskFreeLabels(task).join(', ');
    else if (field === 'ped') initial = this.getOrderText(task);
    else if (field === 'rede') initial = this.getNetworkPath(task);
    else if (field === 'exec') initial = this.getExecutionDateRaw(task);
    else if (field === 'dueDate') initial = task.dueDate ? task.dueDate.split('T')[0] : '';
    else if (field.startsWith('col_')) {
      const col = this.customColumns().find(c => c.id === field);
      if (col) initial = String(this.getCustomFieldValue(task, col) || '');
    }

    this.inlineEditValue = initial;
    this.inlineEditingCell.set({ taskId: task.id, field });
  }

  cancelInlineEdit(event?: Event): void {
    if (event) event.stopPropagation();
    this.inlineEditingCell.set(null);
  }

  saveInlineEdit(task: KanbanTask, field: string, event?: Event): void {
    if (event) event.stopPropagation();
    if (field.startsWith('col_')) {
      const col = this.customColumns().find(c => c.id === field);
      if (col) this.updateCustomField(task, col, this.inlineEditValue);
    } else {
      this.updateTaskField(task, field, this.inlineEditValue);
    }
    this.inlineEditingCell.set(null);
  }

  updateTaskField(task: KanbanTask, field: string, value: any, event?: Event): void {
    if (event) event.stopPropagation();
    const board = this.board();
    if (!board) return;

    if (field === 'dueDate') {
      const dateVal = value ? value : null;
      this.service.updateTask(task.id, { dueDate: dateVal });
      return;
    }

    if (field === 'title') {
      const titleVal = (value || '').trim();
      if (titleVal && titleVal !== task.title) {
        this.service.updateTask(task.id, { title: titleVal });
      }
      return;
    }

    if (field === 'demand' || field === 'description') {
      this.service.updateTask(task.id, { description: value || '' });
      return;
    }

    if (field === 'labels') {
      const freeParts = typeof value === 'string'
        ? value.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const nonFree = (task.labels || []).filter(l => l.startsWith('cx_') || /^(setor|macro|exec|ped|pedido|rede):/i.test(l));
      this.service.updateTask(task.id, { labels: [...freeParts, ...nonFree].slice(0, 30) });
      return;
    }

    if (field === 'assignee') {
      const userId = value;
      let newAssignees: string[] = [];
      if (userId === 'none' || !userId) {
        newAssignees = [];
      } else {
        newAssignees = [userId];
      }
      this.service.updateTask(task.id, { assigneeIds: newAssignees });
      return;
    }

    // Label-based fields: setor, macro, exec, ped, rede
    const cleanLabels = (task.labels || []).filter(l => {
      if (field === 'setor') return !/^setor:/i.test(l) && !this.predefinedSectors.some(s => s.toLowerCase() === l.toLowerCase().replace(/^#/, ''));
      if (field === 'macro') return !/^macro:/i.test(l) && !this.predefinedMacroThemes.some(m => m.toLowerCase() === l.toLowerCase().replace(/^#/, ''));
      if (field === 'exec') return !/^exec:/i.test(l);
      if (field === 'ped') return !/^(ped|pedido|ped-|ord-|#ped):?/i.test(l);
      if (field === 'rede') return !/^rede:/i.test(l);
      return true;
    });

    const val = typeof value === 'string' ? value.trim() : '';
    if (val) {
      cleanLabels.push(`${field}:${val}`);
    }

    this.service.updateTask(task.id, { labels: cleanLabels.slice(0, 30) });
  }

  getPriorityLabel(priority?: TaskPriority | string): string {
    switch (priority) {
      case 'urgent': return 'Urgente';
      case 'high': return 'Alta';
      case 'medium': return 'Média';
      case 'low': return 'Baixa';
      default: return 'Média';
    }
  }

  getPriorityIcon(priority?: TaskPriority | string): string {
    switch (priority) {
      case 'urgent': return 'error_outline';
      case 'high': return 'flag';
      case 'medium': return 'outlined_flag';
      case 'low': return 'arrow_downward';
      default: return 'outlined_flag';
    }
  }

  currentSortLabel(): string {
    if (this.sortOption() === 'default') {
      return 'Ordenar';
    }
    const map: Record<string, string> = {
      dueDate: 'Prazo',
      priority: 'Prioridade',
      title: 'Assunto',
      status: 'Status',
    };
    const label = map[this.sortOption()] || 'Ordenar';
    return `${label} ${this.sortDirection() === 'asc' ? '↑' : '↓'}`;
  }

  autoArchiveLabel(delay?: string): string {
    switch (delay) {
      case 'immediate': return 'Imediatamente';
      case '1h': return 'Após 1 hora';
      case '6h': return 'Após 6 horas';
      case '12h': return 'Após 12 horas';
      case '24h': return 'Após 1 dia';
      case '48h': return 'Após 2 dias';
      case '72h': return 'Após 3 dias';
      case '7d': return 'Após 7 dias';
      default: return 'Nunca';
    }
  }

  getColumnTitle(columnId: string): string {
    const col = this.board()?.columns.find(c => c.id === columnId);
    return col?.title || 'Sem lista';
  }

  getColumnColor(columnId: string): string {
    const col = this.board()?.columns.find(c => c.id === columnId);
    return col?.color || 'var(--brand-500)';
  }

  getColumnBg(columnId: string): string {
    const color = this.getColumnColor(columnId);
    return `color-mix(in srgb, ${color} 15%, transparent)`;
  }

  getDemandText(task: KanbanTask): string {
    if (task.description && task.description.trim()) {
      const firstLine = task.description.trim().split('\n')[0].replace(/^#+\s*/, '');
      return firstLine.length > 70 ? firstLine.substring(0, 70) + '...' : firstLine;
    }
    if (task.checklist && task.checklist.length) {
      const done = task.checklist.filter(i => i.done).length;
      return `Checklist (${done}/${task.checklist.length})`;
    }
    return '—';
  }

  setActiveTab(tab: 'month_tasks' | 'month_completed' | 'week_tasks' | 'kanban'): void {
    this.activeTab.set(tab);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dc_kanban_active_tab', tab);
    }
  }

  getSectorText(task: KanbanTask): string {
    const sectorLabel = task.labels?.find(l => l.toLowerCase().startsWith('setor:') || l.toLowerCase().startsWith('setor '));
    if (sectorLabel) {
      return sectorLabel.replace(/^setor:?\s*/i, '').trim();
    }
    const match = task.labels?.find(l => this.predefinedSectors.some(s => s.toLowerCase() === l.toLowerCase().replace(/^#/, '')));
    if (match) return match.replace(/^#/, '');

    const board = this.board();
    if (board?.teamName) return board.teamName;
    const currentTeam = this.currentTeam();
    if (currentTeam?.name) return currentTeam.name;
    return 'Gráfico - P&D';
  }

  getSectorTheme(sector: string): { color: string; bg: string; border: string } {
    const s = (sector || '').toLowerCase();
    if (s.includes('gráfico') || s.includes('grafico') || s.includes('p&d') || s.includes('arte final')) {
      return { color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.18)', border: 'rgba(245, 158, 11, 0.35)' };
    }
    if (s.includes('compra') || s.includes('impress')) {
      return { color: '#d6d3d1', bg: 'rgba(120, 113, 108, 0.25)', border: 'rgba(120, 113, 108, 0.4)' };
    }
    if (s.includes('pcp') || s.includes('produç') || s.includes('produc')) {
      return { color: '#cbd5e1', bg: 'rgba(100, 116, 139, 0.25)', border: 'rgba(100, 116, 139, 0.4)' };
    }
    if (s.includes('social') || s.includes('mídia') || s.includes('midia')) {
      return { color: '#e879f9', bg: 'rgba(217, 70, 239, 0.18)', border: 'rgba(217, 70, 239, 0.35)' };
    }
    if (s.includes('licen') || s.includes('royal')) {
      return { color: '#5eead4', bg: 'rgba(20, 184, 166, 0.18)', border: 'rgba(20, 184, 166, 0.35)' };
    }
    return { color: '#e2e8f0', bg: 'rgba(148, 163, 184, 0.18)', border: 'rgba(148, 163, 184, 0.3)' };
  }

  getMacroTheme(task: KanbanTask, withEmoji = true): string {
    const macroLabel = task.labels?.find(l => l.toLowerCase().startsWith('macro:') || l.toLowerCase().startsWith('macro '));
    let name = macroLabel ? macroLabel.replace(/^macro:?\s*/i, '').trim() : '';
    if (!name) {
      const match = task.labels?.find(l => this.predefinedMacroThemes.some(m => m.toLowerCase() === l.toLowerCase().replace(/^#/, '')));
      if (match) name = match.replace(/^#/, '');
    }
    if (!name) {
      name = this.board()?.name || 'Galeroca';
    }
    if (!withEmoji) return name;

    const n = name.toLowerCase();
    if (n.includes('compra')) return `🛒 ${name}`;
    if (n.includes('galeroca')) return `⚱️ ${name}`;
    if (n.includes('pcp')) return `🔀 ${name}`;
    if (n.includes('reil leão') || n.includes('rei leao') || n.includes('enlace')) return `🏆 ${name}`;
    if (n.includes('venom') || n.includes('gelelé venom') || n.includes('gelele')) return `★ ${name}`;
    if (n.includes('maria')) return `📁 ${name}`;
    return `📁 ${name}`;
  }

  getExecutionDate(task: KanbanTask): string {
    const execLabel = task.labels?.find(l => l.toLowerCase().startsWith('exec:'));
    if (execLabel) {
      return this.formatFullDate(execLabel.replace(/^exec:\s*/i, '').trim());
    }
    const colTitle = this.getColumnTitle(task.columnId).toLowerCase();
    const isCompleted = colTitle.includes('finaliz') || colTitle.includes('conclu') || colTitle.includes('done');
    if (isCompleted && task.updatedAt) {
      return this.formatFullDate(task.updatedAt);
    }
    return '';
  }

  getExecutionDateRaw(task: KanbanTask): string {
    const execLabel = task.labels?.find(l => l.toLowerCase().startsWith('exec:'));
    if (execLabel) return execLabel.replace(/^exec:\s*/i, '').trim();
    return '';
  }

  getOrderText(task: KanbanTask): string {
    const orderLabel = task.labels?.find(l => /^(ped|pedido|ped-|ord-|#ped):?/i.test(l));
    if (orderLabel) {
      return orderLabel.replace(/^(ped|pedido|ped-|ord-|#ped):?\s*/i, '').replace(/^#/, '');
    }
    return '';
  }

  getNetworkPath(task: KanbanTask): string {
    const redeLabel = task.labels?.find(l => l.toLowerCase().startsWith('rede:'));
    if (redeLabel) {
      return redeLabel.replace(/^rede:\s*/i, '').trim();
    }
    return '';
  }

  getAssigneeBadgeStyle(assigneeName: string): { bg: string; color: string; border: string } {
    const n = (assigneeName || '').toLowerCase();
    if (n.includes('emily')) return { bg: 'rgba(244, 114, 182, 0.2)', color: '#f472b6', border: 'rgba(244, 114, 182, 0.4)' };
    if (n.includes('eduardo')) return { bg: 'rgba(74, 222, 128, 0.2)', color: '#4ade80', border: 'rgba(74, 222, 128, 0.4)' };
    if (n.includes('marcus')) return { bg: 'rgba(96, 165, 250, 0.2)', color: '#60a5fa', border: 'rgba(96, 165, 250, 0.4)' };
    if (n.includes('luisa')) return { bg: 'rgba(251, 146, 60, 0.2)', color: '#fb923c', border: 'rgba(251, 146, 60, 0.4)' };
    if (n.includes('giovanna')) return { bg: 'rgba(248, 113, 113, 0.2)', color: '#f87171', border: 'rgba(248, 113, 113, 0.4)' };
    if (n.includes('felix')) return { bg: 'rgba(167, 139, 250, 0.2)', color: '#a78bfa', border: 'rgba(167, 139, 250, 0.4)' };
    if (n.includes('leticia')) return { bg: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.4)' };
    if (n.includes('fornecedor')) return { bg: 'rgba(192, 132, 252, 0.2)', color: '#c084fc', border: 'rgba(192, 132, 252, 0.4)' };
    return { bg: 'rgba(244, 114, 182, 0.15)', color: '#f472b6', border: 'rgba(244, 114, 182, 0.3)' };
  }

  getStatusTheme(columnId: string): { className: string; color: string; bg: string; dot: string; border: string } {
    const title = this.getColumnTitle(columnId).toLowerCase();
    if (title.includes('finaliz') || title.includes('conclu') || title.includes('done')) {
      return { className: 'status-done', color: '#4ade80', bg: 'rgba(34, 197, 94, 0.18)', dot: '#22c55e', border: 'rgba(34, 197, 94, 0.4)' };
    }
    if (title.includes('não finalizado') || title.includes('nao finalizado') || title.includes('andamento') || title.includes('doing') || title.includes('fazendo')) {
      return { className: 'status-in-progress', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.18)', dot: '#3b82f6', border: 'rgba(59, 130, 246, 0.4)' };
    }
    if (title.includes('cancelad') || title.includes('bloquead')) {
      return { className: 'status-canceled', color: '#f87171', bg: 'rgba(239, 68, 68, 0.18)', dot: '#ef4444', border: 'rgba(239, 68, 68, 0.4)' };
    }
    if (title.includes('espera') || title.includes('aguard') || title.includes('pendent') || title.includes('pausa')) {
      return { className: 'status-waiting', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.18)', dot: '#f59e0b', border: 'rgba(245, 158, 11, 0.4)' };
    }
    if (title.includes('fazer') || title.includes('backlog') || title.includes('abert') || title.includes('todo')) {
      return { className: 'status-todo', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.18)', dot: '#94a3b8', border: 'rgba(148, 163, 184, 0.4)' };
    }
    const color = this.getColumnColor(columnId);
    return {
      className: 'status-custom',
      color: color || '#94a3b8',
      bg: `color-mix(in srgb, ${color || '#94a3b8'} 18%, transparent)`,
      dot: color || '#94a3b8',
      border: `color-mix(in srgb, ${color || '#94a3b8'} 35%, transparent)`
    };
  }

  changeTaskColumn(task: KanbanTask, newColumnId: string, event?: Event): void {
    if (event) event.stopPropagation();
    if (task.columnId === newColumnId) return;
    const board = this.board();
    if (!board) return;
    const updatedTasks = board.tasks.map(item => item.id === task.id ? { ...item, columnId: newColumnId } : item);
    this.service.activeBoard.set({ ...board, tasks: updatedTasks });
    this.service.updateTask(task.id, { columnId: newColumnId });
  }


  printSingleTask(): void {
    this.printingSingleTask.set(true);
    document.body.classList.add('print-single-task-mode');
    setTimeout(() => {
      window.print();
    }, 150);
  }

  columnTitle(columnId: string): string {
    return this.board()?.columns.find(c => c.id === columnId)?.title || 'Etapa';
  }

  draftAssigneeNames(): string {
    if (!this.draft.assigneeIds.length) return 'Não atribuído';
    return this.draft.assigneeIds.map(id => this.assigneeName(id)).filter(Boolean).join(', ');
  }

  formatDueDate(dateStr?: string | null): string {
    if (!dateStr) return '';
    const clean = dateStr.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return clean;
  }

  getTaskFreeLabels(task: KanbanTask): string[] {
    if (!task || !task.labels) return [];
    return task.labels.filter(l => !l.startsWith('cx_') && !/^(setor|macro|exec|ped|pedido|rede):/i.test(l));
  }

  draftLabels(): string[] {
    if (this.labelText) {
      return this.labelText.split(',').map(s => s.trim()).filter(Boolean);
    }
    return (this.draft.labels || []).filter(l => !l.startsWith('cx_') && !/^(setor|macro|exec|ped|pedido|rede):/i.test(l));
  }

  printBoard(): void {
    this.printingSingleTask.set(false);
    document.body.classList.remove('print-single-task-mode');
    setTimeout(() => {
      window.print();
    }, 80);
  }

  printDateTime(): string {
    const now = new Date();
    const dateStr = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
    const timeStr = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(now);
    return `${dateStr}  ${timeStr}`;
  }

  formatFullDate(date: string | null): string {
    if (!date) return '';
    try {
      const cleanDate = date.includes('T') ? date : `${date}T12:00:00`;
      const d = new Date(cleanDate);
      if (isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    } catch {
      return '';
    }
  }

  assigneeNames(task: KanbanTask): string {
    if (!task.assigneeIds.length) return '';
    return task.assigneeIds.map(id => this.assigneeName(id)).filter(Boolean).join(', ');
  }

  columnPrintColor(column: KanbanColumn, index: number): string {
    if (column.color && column.color !== '#4f46e5' && column.color !== 'var(--brand-500)') return column.color;
    const palette = ['#475569', '#f59e0b', '#8b5cf6', '#10b981', '#0ea5e9', '#ec4899', '#6366f1'];
    return palette[index % palette.length];
  }

  columnPrintBg(column: KanbanColumn, index: number): string {
    const bgPalette = ['#f8fafc', '#fffbeb', '#f5f3ff', '#ecfdf5', '#f0f9ff', '#fdf2f8', '#eef2ff'];
    return bgPalette[index % bgPalette.length];
  }

  trackById(_: number, item: { id: string }): string { return item.id; }

  private updateUrl(queryParams: Record<string, string | null>, replaceUrl = false): void {
    const boardId = this.board()?.id || this.route.snapshot.paramMap.get('boardId');
    void this.router.navigate(boardId ? ['/tarefas', boardId] : ['/tarefas'], {
      replaceUrl,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }

  private emptyDraft(columnId: string, parentTaskId: string | null = null): KanbanTaskInput {
    return { title: '', description: '', columnId, priority: 'medium', dueDate: null, labels: [], assigneeIds: [], checklist: [], parentTaskId };
  }
}
