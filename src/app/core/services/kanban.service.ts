import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, finalize, of, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { KanbanBoard, KanbanBoardSummary, KanbanColumn, KanbanTask, KanbanTaskInput, KanbanTeam, KanbanTeamInvitation, KanbanTeamMember } from '../models/kanban.model';

@Injectable({ providedIn: 'root' })
export class KanbanService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly boards = signal<KanbanBoardSummary[]>([]);
  readonly activeBoard = signal<KanbanBoard | null>(null);
  readonly teams = signal<KanbanTeam[]>([]);
  readonly teamInvitations = signal<KanbanTeamInvitation[]>([]);
  readonly teamMembers = signal<KanbanTeamMember[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  private ignoreRealtimeUntil = 0;

  private get headers() { return { 'x-user-id': this.auth.currentUser()?.id || 'anonymous' }; }

  loadBoards(selectId?: string): void {
    if (this.headers['x-user-id'] === 'anonymous') return;
    this.loading.set(true);
    this.http.get<KanbanBoardSummary[]>('/api/kanban/boards', { headers: this.headers }).pipe(
      catchError(err => { this.error.set(err.error?.error || 'Não foi possível carregar os quadros.'); return of([]); }),
      finalize(() => this.loading.set(false))
    ).subscribe(boards => {
      this.boards.set(boards);
      const target = selectId || this.activeBoard()?.id || boards[0]?.id;
      if (target) this.loadBoard(target);
    });
  }

  loadWorkspace(): void {
    this.loadTeams();
    this.loadTeamInvitations();
    this.loadBoards();
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
        this.teams.update(items => [...items, team]);
        this.loadBoards(team.boardId);
      });
  }

  updateTeam(id: string, changes: Partial<KanbanTeam>): void {
    this.http.put<KanbanTeam>(`/api/kanban/teams/${id}`, changes, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao atualizar time.'); return of(null); }))
      .subscribe(team => { if (team) this.loadTeams(); });
  }

  deleteTeam(id: string): void {
    this.http.delete(`/api/kanban/teams/${id}`, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao excluir time.'); return of(null); }))
      .subscribe(result => { if (result) { this.activeBoard.set(null); this.loadWorkspace(); } });
  }

  loadTeamMembers(teamId: string): void {
    this.http.get<KanbanTeamMember[]>(`/api/kanban/teams/${teamId}/members`, { headers: this.headers })
      .pipe(catchError(() => of([])))
      .subscribe(members => this.teamMembers.set(members));
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
    this.loading.set(true);
    this.error.set('');
    this.http.get<KanbanBoard>(`/api/kanban/boards/${id}`, { headers: this.headers }).pipe(
      catchError(err => { this.error.set(err.error?.error || 'Não foi possível carregar o quadro.'); return of(null); }),
      finalize(() => this.loading.set(false))
    ).subscribe(board => { if (board) this.activeBoard.set(board); });
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

  createColumn(boardId: string, title: string): void {
    this.http.post<KanbanColumn>(`/api/kanban/boards/${boardId}/columns`, { title }, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao criar lista.'); return of(null); }))
      .subscribe(column => {
        if (column) this.activeBoard.update(board => board ? { ...board, columns: [...board.columns, column] } : board);
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
    this.http.delete(`/api/kanban/columns/${id}`, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao excluir lista.'); return of(null); }))
      .subscribe(result => {
        if (result) this.activeBoard.update(board => board ? { ...board, columns: board.columns.filter(column => column.id !== id) } : board);
      });
  }

  createTask(boardId: string, input: KanbanTaskInput): void {
    this.http.post<KanbanTask>(`/api/kanban/boards/${boardId}/tasks`, input, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao criar tarefa.'); return of(null); }))
      .subscribe(task => { if (task) this.upsertTask(task); });
  }

  updateTask(id: string, changes: Partial<KanbanTask>): void {
    this.http.put<KanbanTask>(`/api/kanban/tasks/${id}`, changes, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao atualizar tarefa.'); return of(null); }))
      .subscribe(task => { if (task) this.upsertTask(task); });
  }

  deleteTask(id: string): void {
    this.http.delete(`/api/kanban/tasks/${id}`, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao excluir tarefa.'); return of(null); }))
      .subscribe(result => {
        if (result) this.activeBoard.update(board => board ? { ...board, tasks: board.tasks.filter(task => task.id !== id) } : board);
      });
  }

  reorder(boardId: string, columns: string[], tasks: { id: string; columnId: string; position: number }[]): void {
    this.ignoreRealtimeUntil = Date.now() + 1200;
    this.http.post(`/api/kanban/boards/${boardId}/reorder`, { columns, tasks }, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Erro ao reordenar.'); this.loadBoard(boardId); return of(null); }))
      .subscribe();
  }

  shouldIgnoreRealtime(): boolean { return Date.now() < this.ignoreRealtimeUntil; }

  private upsertTask(task: KanbanTask): void {
    this.activeBoard.update(board => {
      if (!board) return board;
      const exists = board.tasks.some(item => item.id === task.id);
      return { ...board, tasks: exists ? board.tasks.map(item => item.id === task.id ? task : item) : [...board.tasks, task] };
    });
  }
}
