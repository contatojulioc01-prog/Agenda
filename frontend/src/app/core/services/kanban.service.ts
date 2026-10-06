import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, finalize, of, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { KanbanBoard, KanbanBoardSummary, KanbanColumn, KanbanTask, KanbanTaskInput, KanbanTeam, KanbanTeamInvitation, KanbanTeamMember } from '../models/kanban.model';
import { Attachment } from '../models/attachment.model';

@Injectable({ providedIn: 'root' })
export class KanbanService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly boards = signal<KanbanBoardSummary[]>([]);
  readonly activeBoard = signal<KanbanBoard | null>(null);
  readonly teams = signal<KanbanTeam[]>([]);
  readonly teamInvitations = signal<KanbanTeamInvitation[]>([]);
  readonly teamMembers = signal<KanbanTeamMember[]>([]);
  readonly trash = signal<KanbanTask[]>([]);
  readonly trashLoading = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  private boardLoadVersion = new Map<string, number>();
  private boardsLoadVersion = 0;
  private teamMembersLoadVersion = 0;

  private get headers() { return { 'x-user-id': this.auth.currentUser()?.id || 'anonymous' }; }

  loadBoards(selectId?: string): void {
    if (this.headers['x-user-id'] === 'anonymous') return;
    const version = ++this.boardsLoadVersion;
    this.loading.set(true);
    this.http.get<KanbanBoardSummary[]>('/api/kanban/boards', { headers: this.headers }).pipe(
      catchError(err => { this.error.set(err.error?.error || 'Não foi possível carregar os quadros.'); return of(null); }),
      finalize(() => this.loading.set(false))
    ).subscribe(boards => {
      if (version !== this.boardsLoadVersion) return;
      if (boards === null) return;
      this.boards.set(boards);
      const requested = selectId || this.activeBoard()?.id;
      const target = boards.some(board => board.id === requested) ? requested : boards[0]?.id;
      if (target) this.loadBoard(target);
      else this.activeBoard.set(null);
    });
  }

  loadWorkspace(selectId?: string): void {
    this.loadTeams();
    this.loadTeamInvitations();
    this.loadBoards(selectId);
  }

  loadTeams(): void {
    if (this.headers['x-user-id'] === 'anonymous') return;
    this.http.get<KanbanTeam[]>('/api/kanban/teams', { headers: this.headers })
      .pipe(catchError(() => of([])))
      .subscribe(teams => this.teams.set(teams));
  }

  createTeam(name: string, description = '', color = '#4f46e5'): void {
    this.http.post<KanbanTeam>('/api/kanban/teams', { name, description, color }, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao criar time.'); return of(null); }))
      .subscribe(team => {
        if (!team) return;
        this.teams.update(items => items.some(item => item.id === team.id)
          ? items.map(item => item.id === team.id ? team : item)
          : [...items, team]);
        this.loadBoards(team.boardId);
      });
  }

  updateTeam(id: string, changes: Partial<KanbanTeam>): void {
    this.http.put<KanbanTeam>(`/api/kanban/teams/${id}`, changes, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao atualizar time.'); return of(null); }))
      .subscribe(team => { if (team) this.loadTeams(); });
  }

  deleteTeam(id: string, onComplete?: (success: boolean) => void): void {
    this.http.delete(`/api/kanban/teams/${id}`, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao excluir time.'); return of(null); }))
      .subscribe(result => {
        if (result) {
          if (this.activeBoard()?.teamId === id) this.activeBoard.set(null);
          this.teams.update(items => items.filter(team => team.id !== id));
          this.boards.update(items => items.filter(board => board.teamId !== id));
          this.loadWorkspace();
        }
        onComplete?.(!!result);
      });
  }

  loadTeamMembers(teamId: string): void {
    const version = ++this.teamMembersLoadVersion;
    this.teamMembers.set([]);
    this.http.get<KanbanTeamMember[]>(`/api/kanban/teams/${teamId}/members`, { headers: this.headers })
      .pipe(catchError(() => of([])))
      .subscribe(members => {
        if (version === this.teamMembersLoadVersion) this.teamMembers.set(members);
      });
  }

  clearTeamMembers(): void {
    this.teamMembersLoadVersion++;
    this.teamMembers.set([]);
  }

  inviteToTeam(teamId: string, invitedUserId: string): void {
    this.http.post(`/api/kanban/teams/${teamId}/invitations`, { userId: invitedUserId }, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao enviar convite.'); return of(null); }))
      .subscribe(result => { if (result) this.loadTeamMembers(teamId); });
  }

  removeTeamMember(teamId: string, memberId: string): void {
    this.http.delete(`/api/kanban/teams/${teamId}/members/${memberId}`, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao remover membro.'); return of(null); }))
      .subscribe(result => { if (result) { this.loadTeamMembers(teamId); this.loadTeams(); } });
  }

  loadTeamInvitations(): void {
    if (this.headers['x-user-id'] === 'anonymous') return;
    this.http.get<KanbanTeamInvitation[]>('/api/kanban/team-invitations', { headers: this.headers })
      .pipe(catchError(() => of([])))
      .subscribe(items => this.teamInvitations.set(items));
  }

  respondToTeamInvitation(invitation: KanbanTeamInvitation, accept: boolean): void {
    this.http.put(`/api/kanban/team-invitations/${invitation.id}`, { accept }, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao responder convite.'); return of(null); }))
      .subscribe(result => {
        if (!result) return;
        this.teamInvitations.update(items => items.filter(item => item.id !== invitation.id));
        if (accept) this.loadWorkspace();
      });
  }

  loadBoard(id: string): void {
    const version = (this.boardLoadVersion.get(id) || 0) + 1;
    this.boardLoadVersion.set(id, version);
    this.loading.set(true);
    this.error.set('');
    this.http.get<KanbanBoard>(`/api/kanban/boards/${id}`, { headers: this.headers }).pipe(
      catchError(err => {
        this.error.set(err.error?.error || 'Não foi possível carregar o quadro.');
        if (err.status === 404 && this.activeBoard()?.id === id) {
          this.activeBoard.set(null);
          this.loadBoards();
        }
        return of(null);
      }),
      finalize(() => this.loading.set(false))
    ).subscribe(board => {
      if (board && this.boardLoadVersion.get(id) === version) {
        this.activeBoard.set(board);
        this.boards.update(items => items.map(item => item.id === id
          ? { ...item, taskCount: board.tasks.filter(task => !task.archived).length }
          : item));
      }
    });
  }

  createBoard(name: string): void {
    this.http.post<KanbanBoardSummary>('/api/kanban/boards', { name }, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao criar quadro.'); return of(null); }))
      .subscribe(board => { if (board) this.loadBoards(board.id); });
  }

  updateBoard(id: string, changes: Partial<KanbanBoardSummary>): void {
    this.http.put<KanbanBoardSummary>(`/api/kanban/boards/${id}`, changes, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao atualizar quadro.'); return of(null); }))
      .subscribe(board => {
        if (!board) return;
        this.boards.update(items => items.map(item => item.id === id ? { ...item, ...board } : item));
        this.activeBoard.update(current => current?.id === id ? { ...current, ...board } : current);
      });
  }

  deleteBoard(id: string): void {
    this.http.delete(`/api/kanban/boards/${id}`, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao excluir quadro.'); return of(null); }))
      .subscribe(result => { if (result) { this.activeBoard.set(null); this.loadBoards(); } });
  }

  createColumn(boardId: string, title: string, color?: string, autoArchiveDelay?: string): void {
    this.http.post<KanbanColumn>(`/api/kanban/boards/${boardId}/columns`, { title, ...(color ? { color } : {}), ...(autoArchiveDelay ? { autoArchiveDelay } : {}) }, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao criar lista.'); return of(null); }))
      .subscribe(column => {
        if (column) this.activeBoard.update(board => {
          if (!board) return board;
          const exists = board.columns.some(item => item.id === column.id);
          return { ...board, columns: exists
            ? board.columns.map(item => item.id === column.id ? column : item)
            : [...board.columns, column] };
        });
      });
  }

  updateColumn(id: string, changes: Partial<KanbanColumn>): void {
    this.http.put<KanbanColumn>(`/api/kanban/columns/${id}`, changes, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao atualizar lista.'); return of(null); }))
      .subscribe(column => {
        if (column) this.activeBoard.update(board => board ? { ...board, columns: board.columns.map(item => item.id === id ? column : item) } : board);
      });
  }

  deleteColumn(id: string): void {
    const boardBeforeDelete = this.activeBoard();
    const directIds = new Set((boardBeforeDelete?.tasks || []).filter(task => task.columnId === id).map(task => task.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const task of boardBeforeDelete?.tasks || []) {
        if (task.parentTaskId && directIds.has(task.parentTaskId) && !directIds.has(task.id)) { directIds.add(task.id); changed = true; }
      }
    }
    this.http.delete(`/api/kanban/columns/${id}`, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao excluir lista.'); return of(null); }))
      .subscribe(result => {
        if (result) this.activeBoard.update(board => board ? { ...board, columns: board.columns.filter(column => column.id !== id), tasks: board.tasks.filter(task => !directIds.has(task.id)) } : board);
      });
  }

  createTask(boardId: string, input: KanbanTaskInput, onComplete?: (task: KanbanTask | null) => void): void {
    this.http.post<KanbanTask>(`/api/kanban/boards/${boardId}/tasks`, input, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao criar tarefa.'); return of(null); }))
      .subscribe(task => { if (task) this.upsertTask(task); onComplete?.(task); });
  }

  updateTask(id: string, changes: Partial<KanbanTask>, onComplete?: (task: KanbanTask | null) => void): void {
    this.http.put<KanbanTask>(`/api/kanban/tasks/${id}`, changes, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao atualizar tarefa.'); return of(null); }))
      .subscribe(task => { if (task) this.upsertTask(task); onComplete?.(task); });
  }

  setTaskAttachments(id: string, attachments: Attachment[]): void {
    this.activeBoard.update(board => board ? { ...board, tasks: board.tasks.map(task => task.id === id ? { ...task, attachments } : task) } : board);
  }

  deleteTask(id: string, onComplete?: (success: boolean) => void): void {
    const deletedIds = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const task of this.activeBoard()?.tasks || []) {
        if (task.parentTaskId && deletedIds.has(task.parentTaskId) && !deletedIds.has(task.id)) { deletedIds.add(task.id); changed = true; }
      }
    }
    this.http.delete(`/api/kanban/tasks/${id}`, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao mover tarefa para a lixeira.'); return of(null); }))
      .subscribe(result => {
        if (result) {
          this.activeBoard.update(board => board ? { ...board, tasks: board.tasks.filter(task => !deletedIds.has(task.id)), trashCount: (board.trashCount || 0) + 1 } : board);
          this.boards.update(boards => boards.map(board => board.id === this.activeBoard()?.id
            ? { ...board, taskCount: Math.max(0, (board.taskCount || 0) - deletedIds.size), trashCount: (board.trashCount || 0) + 1 }
            : board));
        }
        onComplete?.(!!result);
      });
  }

  loadTrash(boardId: string): void {
    this.trashLoading.set(true);
    this.http.get<KanbanTask[]>(`/api/kanban/boards/${boardId}/trash`, { headers: this.headers }).pipe(
      catchError(err => { this.error.set(err.error?.error || 'Não foi possível carregar a lixeira.'); return of(null); }),
      finalize(() => this.trashLoading.set(false))
    ).subscribe(tasks => {
      if (tasks !== null) {
        this.trash.set(tasks);
        this.activeBoard.update(board => board?.id === boardId ? { ...board, trashCount: tasks.length } : board);
        this.boards.update(boards => boards.map(board => board.id === boardId ? { ...board, trashCount: tasks.length } : board));
      }
    });
  }

  restoreTask(id: string, onComplete?: (success: boolean) => void): void {
    this.http.put(`/api/kanban/tasks/${id}/restore`, {}, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Não foi possível restaurar a tarefa.'); return of(null); }))
      .subscribe(result => {
        if (result && this.activeBoard()) {
          const boardId = this.activeBoard()!.id;
          this.loadBoard(boardId);
          this.loadTrash(boardId);
          this.loadBoards(boardId);
        }
        onComplete?.(!!result);
      });
  }

  permanentlyDeleteTask(id: string, onComplete?: (success: boolean) => void): void {
    this.http.delete(`/api/kanban/tasks/${id}/permanent`, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Não foi possível excluir a tarefa permanentemente.'); return of(null); }))
      .subscribe(result => {
        if (result && this.activeBoard()) {
          const boardId = this.activeBoard()!.id;
          this.loadTrash(boardId);
          this.loadBoards(boardId);
        }
        onComplete?.(!!result);
      });
  }

  reorder(boardId: string, columns: string[], tasks: { id: string; columnId: string; position: number }[]): void {
    this.http.post(`/api/kanban/boards/${boardId}/reorder`, { columns, tasks }, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao reordenar.'); this.loadBoard(boardId); return of(null); }))
      .subscribe();
  }

  private upsertTask(task: KanbanTask): void {
    this.activeBoard.update(board => {
      if (!board) return board;
      const exists = board.tasks.some(item => item.id === task.id);
      return { ...board, tasks: exists ? board.tasks.map(item => item.id === task.id ? task : item) : [...board.tasks, task] };
    });
  }
}
