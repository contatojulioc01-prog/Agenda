import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, finalize, of } from 'rxjs';
import { AuthService } from './auth.service';
import { MuralBoard, MuralBoardSummary, MuralGroup, MuralItem, MuralItemInput } from '../models/mural.model';
import { ActivityComment, ActivityLog } from '../models/kanban.model';

@Injectable({ providedIn: 'root' })
export class MuralService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly boards = signal<MuralBoardSummary[]>([]);
  readonly activeBoard = signal<MuralBoard | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  private boardsLoadVersion = 0;
  private boardLoadVersion = new Map<string, number>();

  private get headers() {
    return { 'x-user-id': this.auth.currentUser()?.id || 'anonymous' };
  }

  loadBoards(selectId?: string): void {
    if (this.headers['x-user-id'] === 'anonymous') return;
    const version = ++this.boardsLoadVersion;
    this.loading.set(true);

    this.http.get<MuralBoardSummary[]>('/api/mural/boards', { headers: this.headers }).pipe(
      catchError(err => {
        this.error.set(err.error?.error || 'Não foi possível carregar os murais.');
        return of(null);
      }),
      finalize(() => this.loading.set(false))
    ).subscribe(boards => {
      if (version !== this.boardsLoadVersion) return;
      if (boards === null) return;
      this.boards.set(boards);
      const requested = selectId || this.activeBoard()?.id;
      const target = boards.some(board => board.id === requested) ? requested : boards[0]?.id;
      if (target) {
        this.loadBoard(target);
      } else {
        this.activeBoard.set(null);
      }
    });
  }

  loadBoard(id: string): void {
    const version = (this.boardLoadVersion.get(id) || 0) + 1;
    this.boardLoadVersion.set(id, version);
    this.loading.set(true);

    this.http.get<{ board: MuralBoardSummary; groups: MuralGroup[]; items: MuralItem[]; teamMembers: any[] }>(
      `/api/mural/boards/${id}`, { headers: this.headers }
    ).pipe(
      catchError(err => {
        this.error.set(err.error?.error || 'Não foi possível carregar o mural.');
        return of(null);
      }),
      finalize(() => this.loading.set(false))
    ).subscribe(data => {
      if (this.boardLoadVersion.get(id) !== version) return;
      if (!data) return;
      this.activeBoard.set({
        ...data.board,
        groups: data.groups,
        items: data.items,
        teamMembers: data.teamMembers || [],
      });
    });
  }

  createBoard(name: string, description = '', color = '#f59e0b', scopeType: 'personal' | 'team' = 'personal', teamId: string | null = null, onComplete?: (board: MuralBoardSummary | null) => void): void {
    this.http.post<MuralBoardSummary>('/api/mural/boards', { name, description, color, scopeType, teamId }, { headers: this.headers })
      .pipe(
        catchError(err => {
          this.error.set(err.error?.error || 'Erro ao criar mural.');
          return of(null);
        })
      )
      .subscribe(created => {
        if (created) {
          this.boards.update(items => [...items, created]);
          this.loadBoard(created.id);
        }
        onComplete?.(created);
      });
  }

  updateBoard(id: string, changes: Partial<MuralBoardSummary>, onComplete?: (success: boolean) => void): void {
    this.http.put<MuralBoardSummary>(`/api/mural/boards/${id}`, changes, { headers: this.headers })
      .pipe(
        catchError(err => {
          this.error.set(err.error?.error || 'Erro ao atualizar mural.');
          return of(null);
        })
      )
      .subscribe(updated => {
        if (updated) {
          this.boards.update(list => list.map(b => b.id === id ? { ...b, ...updated } : b));
          if (this.activeBoard()?.id === id) {
            this.activeBoard.update(curr => curr ? { ...curr, ...updated } : null);
          }
        }
        onComplete?.(!!updated);
      });
  }

  deleteBoard(id: string, onComplete?: (success: boolean) => void): void {
    this.http.delete(`/api/mural/boards/${id}`, { headers: this.headers })
      .pipe(
        catchError(err => {
          this.error.set(err.error?.error || 'Erro ao excluir mural.');
          return of(null);
        })
      )
      .subscribe(res => {
        if (res) {
          this.boards.update(list => list.filter(b => b.id !== id));
          if (this.activeBoard()?.id === id) {
            this.activeBoard.set(null);
          }
          this.loadBoards();
        }
        onComplete?.(!!res);
      });
  }

  createGroup(boardId: string, title: string, color = '#64748b', onComplete?: (group: MuralGroup | null) => void): void {
    this.http.post<MuralGroup>(`/api/mural/boards/${boardId}/groups`, { title, color }, { headers: this.headers })
      .pipe(
        catchError(err => {
          this.error.set(err.error?.error || 'Erro ao criar grupo.');
          return of(null);
        })
      )
      .subscribe(group => {
        if (group && this.activeBoard()?.id === boardId) {
          this.activeBoard.update(curr => curr ? { ...curr, groups: [...curr.groups, group] } : null);
        }
        onComplete?.(group);
      });
  }

  updateGroup(groupId: string, changes: Partial<MuralGroup>, onComplete?: (group: MuralGroup | null) => void): void {
    this.http.put<MuralGroup>(`/api/mural/groups/${groupId}`, changes, { headers: this.headers })
      .pipe(
        catchError(err => {
          this.error.set(err.error?.error || 'Erro ao atualizar grupo.');
          return of(null);
        })
      )
      .subscribe(updated => {
        if (updated) {
          this.activeBoard.update(curr => curr ? {
            ...curr,
            groups: curr.groups.map(g => g.id === groupId ? { ...g, ...updated } : g)
          } : null);
        }
        onComplete?.(updated);
      });
  }

  deleteGroup(groupId: string, onComplete?: (success: boolean) => void): void {
    this.http.delete(`/api/mural/groups/${groupId}`, { headers: this.headers })
      .pipe(
        catchError(err => {
          this.error.set(err.error?.error || 'Erro ao remover grupo.');
          return of(null);
        })
      )
      .subscribe(res => {
        if (res) {
          this.activeBoard.update(curr => curr ? {
            ...curr,
            groups: curr.groups.filter(g => g.id !== groupId),
            items: curr.items.map(i => i.groupId === groupId ? { ...i, groupId: null } : i)
          } : null);
        }
        onComplete?.(!!res);
      });
  }

  createItem(boardId: string, itemInput: MuralItemInput, onComplete?: (item: MuralItem | null) => void): void {
    this.http.post<MuralItem>(`/api/mural/boards/${boardId}/items`, itemInput, { headers: this.headers })
      .pipe(
        catchError(err => {
          this.error.set(err.error?.error || 'Erro ao criar nota.');
          return of(null);
        })
      )
      .subscribe(item => {
        if (item && this.activeBoard()?.id === boardId) {
          this.activeBoard.update(curr => curr ? { ...curr, items: [item, ...curr.items] } : null);
          this.boards.update(list => list.map(b => b.id === boardId ? { ...b, itemCount: b.itemCount + 1 } : b));
        }
        onComplete?.(item);
      });
  }

  updateItem(itemId: string, changes: Partial<MuralItem>, onComplete?: (item: MuralItem | null) => void): void {
    this.http.put<MuralItem>(`/api/mural/items/${itemId}`, changes, { headers: this.headers })
      .pipe(
        catchError(err => {
          this.error.set(err.error?.error || 'Erro ao atualizar nota.');
          return of(null);
        })
      )
      .subscribe(updated => {
        if (updated) {
          this.activeBoard.update(curr => curr ? {
            ...curr,
            items: curr.items.map(i => i.id === itemId ? { ...i, ...updated } : i)
          } : null);
        }
        onComplete?.(updated);
      });
  }

  deleteItem(itemId: string, onComplete?: (success: boolean) => void): void {
    this.http.delete(`/api/mural/items/${itemId}`, { headers: this.headers })
      .pipe(
        catchError(err => {
          this.error.set(err.error?.error || 'Erro ao excluir nota.');
          return of(null);
        })
      )
      .subscribe(res => {
        if (res) {
          const active = this.activeBoard();
          if (active) {
            this.activeBoard.update(curr => curr ? {
              ...curr,
              items: curr.items.filter(i => i.id !== itemId)
            } : null);
            this.boards.update(list => list.map(b => b.id === active.id ? { ...b, itemCount: Math.max(0, b.itemCount - 1) } : b));
          }
        }
        onComplete?.(!!res);
      });
  }

  /** Timeline e comentários de uma nota do Mural */
  loadTimeline(itemId: string) {
    return this.http.get<{ comments: ActivityComment[]; logs: ActivityLog[] }>(
      `/api/mural/items/${itemId}/timeline`,
      { headers: this.headers }
    );
  }

  /** Adicionar comentário a uma nota do Mural */
  addComment(itemId: string, content: string, userName?: string, userAvatar?: string) {
    return this.http.post<ActivityComment>(
      `/api/mural/items/${itemId}/comments`,
      { content, userName, userAvatar },
      { headers: this.headers }
    );
  }

  /** Conversão cruzada: converter item do mural em tarefa do Kanban */
  convertToTask(itemId: string, data: { boardId: string; columnId?: string; priority?: string; dueDate?: string | null }) {
    return this.http.post<{ success: boolean; taskId: string; boardId: string; columnId: string }>(
      `/api/mural/items/${itemId}/convert-to-task`,
      data,
      { headers: this.headers }
    );
  }
}
