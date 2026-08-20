import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../../core/services/auth.service';
import { KanbanService } from '../../../core/services/kanban.service';
import { KanbanColumn, KanbanTask, KanbanTaskInput, KanbanTeam, TaskPriority } from '../../../core/models/kanban.model';
import { DEFAULT_AVATAR } from '../../../core/models/user.model';

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, MatIconModule, MatTooltipModule],
  templateUrl: './kanban-board.component.html',
  styleUrl: './kanban-board.component.scss',
})
export class KanbanBoardComponent implements OnInit {
  readonly service = inject(KanbanService);
  readonly auth = inject(AuthService);
  readonly board = this.service.activeBoard;
  readonly boards = this.service.boards;
  readonly loading = this.service.loading;
  readonly teams = this.service.teams;
  readonly teamInvitations = this.service.teamInvitations;
  readonly defaultAvatar = DEFAULT_AVATAR;

  readonly search = signal('');
  readonly priorityFilter = signal<TaskPriority | 'all'>('all');
  readonly assigneeFilter = signal('all');
  readonly showArchived = signal(false);
  readonly modalOpen = signal(false);
  readonly editingId = signal<string | null>(null);
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

  newColumnTitle = '';
  newBoardName = '';
  newTeamDescription = '';
  newTeamColor = '#4f46e5';
  invitedUserId = '';
  labelText = '';
  checklistText = '';
  columnTitleDraft = '';
  boardNameDraft = '';

  draft: KanbanTaskInput = this.emptyDraft('');

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

  ngOnInit(): void {
    const load = () => {
      if (this.auth.currentUser()?.id) this.service.loadWorkspace();
      else setTimeout(load, 300);
    };
    load();
  }

  tasksFor(columnId: string): KanbanTask[] {
    return this.tasksByColumn().get(columnId) || [];
  }

  get dropListIds(): string[] { return (this.board()?.columns || []).map(column => column.id); }

  dropTask(event: CdkDragDrop<KanbanTask[]>, target: KanbanColumn): void {
    const board = this.board();
    if (!board) return;
    const task = event.item.data as KanbanTask;
    const sourceId = task.columnId;
    const source = board.tasks.filter(item => !item.archived && item.parentTaskId === this.currentParentId() && item.columnId === sourceId).sort((a, b) => a.position - b.position);
    const destination = sourceId === target.id ? source : board.tasks.filter(item => !item.archived && item.parentTaskId === this.currentParentId() && item.columnId === target.id).sort((a, b) => a.position - b.position);

    if (sourceId === target.id) {
      const from = source.findIndex(item => item.id === task.id);
      source.splice(event.currentIndex, 0, source.splice(from, 1)[0]);
    } else {
      source.splice(source.findIndex(item => item.id === task.id), 1);
      destination.splice(event.currentIndex, 0, { ...task, columnId: target.id });
    }

    const changed = [...source.map((item, position) => ({ ...item, columnId: sourceId, position })),
      ...(sourceId === target.id ? [] : destination.map((item, position) => ({ ...item, columnId: target.id, position })) )];
    const changedMap = new Map(changed.map(item => [item.id, item]));
    this.service.activeBoard.set({ ...board, tasks: board.tasks.map(item => changedMap.get(item.id) || item) });
    this.service.reorder(board.id, [], changed.map(item => ({ id: item.id, columnId: item.columnId, position: item.position })));
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
    const first = columnId || this.board()?.columns[0]?.id;
    if (!first) return;
    this.editingId.set(null);
    this.draft = this.emptyDraft(first, this.currentParentId());
    this.labelText = '';
    this.checklistText = '';
    this.modalOpen.set(true);
  }

  openEdit(task: KanbanTask): void {
    this.editingId.set(task.id);
    this.draft = {
      title: task.title, description: task.description, columnId: task.columnId, priority: task.priority,
      dueDate: task.dueDate, labels: [...task.labels], assigneeIds: [...task.assigneeIds],
      checklist: task.checklist.map(item => ({ ...item })), parentTaskId: task.parentTaskId,
    };
    this.labelText = task.labels.join(', ');
    this.checklistText = '';
    this.modalOpen.set(true);
  }

  saveTask(): void {
    const title = this.draft.title.trim();
    const board = this.board();
    if (!title || !board) return;
    this.draft.title = title;
    this.draft.labels = this.labelText.split(',').map(value => value.trim()).filter(Boolean).slice(0, 8);
    const editing = this.editingId();
    if (editing) this.service.updateTask(editing, this.draft);
    else this.service.createTask(board.id, this.draft);
    this.modalOpen.set(false);
  }

  archiveTask(task: KanbanTask): void {
    this.service.updateTask(task.id, { archived: !task.archived });
    this.modalOpen.set(false);
  }

  archiveEditing(): void {
    const task = this.board()?.tasks.find(item => item.id === this.editingId());
    if (task) this.archiveTask(task);
  }

  deleteEditing(): void {
    const task = this.board()?.tasks.find(item => item.id === this.editingId());
    if (task) this.deleteTask(task);
  }

  deleteTask(task: KanbanTask): void {
    if (task.archived && confirm(`Excluir permanentemente “${task.title}”?`)) {
      this.service.deleteTask(task.id);
      this.modalOpen.set(false);
    }
  }

  addChecklistItem(): void {
    const text = this.checklistText.trim();
    if (!text) return;
    this.draft.checklist.push({ id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, text, done: false });
    this.checklistText = '';
  }

  removeChecklistItem(index: number): void { this.draft.checklist.splice(index, 1); }

  saveColumn(): void {
    const title = this.newColumnTitle.trim();
    const board = this.board();
    if (title && board) this.service.createColumn(board.id, title);
    this.newColumnTitle = '';
    this.addingColumn.set(false);
  }

  toggleColumnMenu(columnId: string, event: Event): void {
    event.stopPropagation();
    this.columnMenuId.set(this.columnMenuId() === columnId ? null : columnId);
  }

  openColumnDialog(column: KanbanColumn, action: 'rename' | 'delete'): void {
    this.selectedColumn.set(column);
    this.columnTitleDraft = column.title;
    this.columnDialog.set(action);
    this.columnMenuId.set(null);
  }

  closeColumnDialog(): void {
    this.columnDialog.set(null);
    this.selectedColumn.set(null);
    this.columnTitleDraft = '';
  }

  confirmColumnDialog(): void {
    const column = this.selectedColumn();
    const action = this.columnDialog();
    if (!column || !action) return;
    if (action === 'rename') {
      const title = this.columnTitleDraft.trim();
      if (!title) return;
      if (title !== column.title) this.service.updateColumn(column.id, { title });
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
    if (this.board()?.id === boardId) return;
    this.parentStack.set([]);
    this.showArchived.set(false);
    const team = this.teams().find(item => item.boardId === boardId);
    if (team) this.service.loadTeamMembers(team.id);
    else this.service.teamMembers.set([]);
    this.service.loadBoard(boardId);
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
    const team = this.currentTeam();
    if (team && confirm('Remover esta pessoa do time?')) this.service.removeTeamMember(team.id, memberId);
  }

  removeTeam(): void {
    const team = this.currentTeam();
    if (team && confirm(`Excluir o time “${team.name}” e todo o Kanban compartilhado?`)) {
      this.service.deleteTeam(team.id);
      this.teamModalOpen.set(false);
    }
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
    return this.auth.allUsers().filter(user => memberIds.has(user.id) && user.id !== this.auth.currentUser()?.id);
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
  }

  openEditingChildBoard(): void {
    const task = this.board()?.tasks.find(item => item.id === this.editingId());
    if (task) this.openChildBoard(task);
  }

  navigateTree(level: number): void {
    this.parentStack.update(stack => level < 0 ? [] : stack.slice(0, level + 1));
    this.showArchived.set(false);
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

  trackById(_: number, item: { id: string }): string { return item.id; }

  private emptyDraft(columnId: string, parentTaskId: string | null = null): KanbanTaskInput {
    return { title: '', description: '', columnId, priority: 'medium', dueDate: null, labels: [], assigneeIds: [], checklist: [], parentTaskId };
  }
}
