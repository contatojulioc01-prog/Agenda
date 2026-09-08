import { Injectable, signal, inject, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of, tap } from 'rxjs';
import { Calendar, CalendarMember, CalendarPermission } from '../models/calendar.model';
import { AuthService } from './auth.service';
import { UserResponse } from '../models/user.model';

export function getBackendUrl(): string {
  // Retorna string vazia para usar caminhos relativos (ex: /api/calendars)
  // O Angular proxy.conf.json irá redirecionar para o backend Node
  return '';
}

@Injectable({ providedIn: 'root' })
export class CalendarsService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  /** Lista de todas as agendas acessíveis pelo usuário */
  calendars = signal<Calendar[]>([]);

  /** IDs das agendas visíveis no calendário (toggle de exibição) */
  visibleCalendarIds = signal<Set<string>>(new Set());

  /** Loading state */
  isLoading = signal(false);
  error = signal('');
  private loadVersion = 0;

  /** Agendas visíveis calculadas */
  visibleCalendars = computed(() =>
    this.calendars().filter(c => this.visibleCalendarIds().has(c.id))
  );

  private get userId(): string {
    return this.authService.currentUser()?.id ?? 'anonymous';
  }

  private get headers() {
    return { 'x-user-id': this.userId };
  }

  /** Carrega todas as agendas do usuário do backend */
  loadAll(afterLoad?: (calendars: Calendar[]) => void): void {
    if (!this.userId || this.userId === 'anonymous') return;
    const version = ++this.loadVersion;
    this.isLoading.set(true);
    this.error.set('');

    this.http.get<Calendar[]>(`${getBackendUrl()}/api/calendars`, { headers: this.headers })
      .pipe(
        catchError(err => {
          console.warn('[CalendarsService] PostgreSQL/backend indisponível:', err.message);
          this.error.set('Não foi possível carregar as agendas do PostgreSQL.');
          return of(null);
        }),
        tap(cals => {
          if (version !== this.loadVersion) return;
          if (cals === null) {
            this.isLoading.set(false);
            afterLoad?.([]);
            return;
          }
          const finalList = (Array.isArray(cals) ? cals : []).map(calendar => ({
            ...calendar,
            members: this.enrichMembersWithUserData(calendar.members || [], this.authService.allUsers()),
          }));
          this.calendars.set(finalList);

          // Tornar todas visíveis por padrão
          const currentId = [...this.visibleCalendarIds()][0];
          const selectedId = finalList.some(calendar => calendar.id === currentId) ? currentId : finalList[0]?.id;
          this.visibleCalendarIds.set(new Set(selectedId ? [selectedId] : []));
          this.isLoading.set(false);
          afterLoad?.(finalList);
        })
      ).subscribe();
  }

  /** Cria nova agenda */
  create(
    name: string,
    color: string,
    isPrivate: boolean,
    initialMembers: { user_id: string; permission: CalendarPermission }[] = [],
    onComplete?: (success: boolean) => void
  ): void {
    const payload = { name, color, isPrivate, members: initialMembers };
    this.error.set('');
    this.http.post<Calendar>(`${getBackendUrl()}/api/calendars`, payload, { headers: this.headers })
      .pipe(catchError(err => {
        this.error.set(err.error?.error || 'Não foi possível salvar a agenda no PostgreSQL.');
        return of(null);
      }))
      .subscribe(cal => {
        if (cal) {
          this.calendars.update(list => {
            const exists = list.some(calendar => calendar.id === cal.id);
            return exists ? list.map(calendar => calendar.id === cal.id ? cal : calendar) : [...list, cal];
          });
          this.visibleCalendarIds.set(new Set([cal.id]));
        }
        onComplete?.(!!cal);
      });
  }

  /** Atualiza agenda existente */
  update(id: string, changes: Partial<Pick<Calendar, 'name' | 'color' | 'isPrivate'>>, onComplete?: (success: boolean) => void): void {
    if (this.calendars().find(calendar => calendar.id === id)?.isTaskCalendar) {
      this.error.set('A agenda Tarefas é gerenciada automaticamente pelo time.');
      onComplete?.(false);
      return;
    }
    this.error.set('');
    this.http.put<Calendar>(`${getBackendUrl()}/api/calendars/${id}`, changes, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Não foi possível atualizar a agenda no PostgreSQL.'); return of(null); }))
      .subscribe(updated => {
        if (updated) {
          this.calendars.update(list => list.map(c => c.id === id ? { ...c, ...updated } : c));
        }
        onComplete?.(!!updated);
      });
  }

  /** Remove agenda */
  remove(id: string, onComplete?: (success: boolean) => void): void {
    const calendar = this.calendars().find(item => item.id === id);
    if (calendar?.isDefault || calendar?.isTaskCalendar) {
      this.error.set(calendar?.isTaskCalendar
        ? 'A agenda Tarefas só pode ser excluída junto com o time.'
        : 'A agenda padrão não pode ser excluída.');
      onComplete?.(false);
      return;
    }
    this.error.set('');
    this.http.delete(`${getBackendUrl()}/api/calendars/${id}`, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Não foi possível excluir a agenda no PostgreSQL.'); return of(null); }))
      .subscribe(result => {
        if (!result) { onComplete?.(false); return; }
        this.calendars.update(list => list.filter(c => c.id !== id));
        const remaining = this.calendars();
        const selected = [...this.visibleCalendarIds()][0];
        const nextId = selected === id || !remaining.some(calendar => calendar.id === selected) ? remaining[0]?.id : selected;
        this.visibleCalendarIds.set(new Set(nextId ? [nextId] : []));
        onComplete?.(true);
      });
  }

  /** Adiciona membro à agenda */
  addMember(calendarId: string, userId: string, permission: CalendarPermission, onComplete?: (success: boolean) => void): void {
    this.http.post<CalendarMember>(
      `${getBackendUrl()}/api/calendars/${calendarId}/members`,
      { userId, permission },
      { headers: this.headers }
    ).pipe(catchError(err => { this.error.set(err.error?.error || 'Não foi possível compartilhar a agenda.'); return of(null); }))
      .subscribe(member => {
        if (member && (member as CalendarMember & { status?: string }).status !== 'pending') {
          this.calendars.update(list =>
            list.map(c => c.id === calendarId
              ? { ...c, members: [...(c.members || []), member] }
              : c
            )
          );
        }
        onComplete?.(!!member);
      });
  }

  /** Atualiza permissão de membro */
  updateMemberPermission(calendarId: string, memberId: string, permission: CalendarPermission, onComplete?: (success: boolean) => void): void {
    this.http.put(
      `${getBackendUrl()}/api/calendars/${calendarId}/members/${memberId}`,
      { permission },
      { headers: this.headers }
    ).pipe(catchError(err => { this.error.set(err.error?.error || 'Não foi possível atualizar a permissão.'); return of(null); }))
      .subscribe(result => {
        if (!result) { onComplete?.(false); return; }
        this.calendars.update(list =>
          list.map(c => c.id === calendarId
            ? {
                ...c,
                members: c.members.map(m =>
                  m.id === memberId ? { ...m, permission } : m
                )
              }
            : c
          )
        );
        onComplete?.(true);
      });
  }

  /** Remove membro da agenda */
  removeMember(calendarId: string, memberId: string, onComplete?: (success: boolean) => void): void {
    this.http.delete(
      `${getBackendUrl()}/api/calendars/${calendarId}/members/${memberId}`,
      { headers: this.headers }
    ).pipe(catchError(err => { this.error.set(err.error?.error || 'Não foi possível remover o membro.'); return of(null); }))
      .subscribe(result => {
        if (!result) { onComplete?.(false); return; }
        this.calendars.update(list =>
          list.map(c => c.id === calendarId
            ? { ...c, members: c.members.filter(m => m.id !== memberId) }
            : c
          )
        );
        onComplete?.(true);
      });
  }

  /** Toggle visibilidade de uma agenda */
  toggleVisibility(calendarId: string): void {
    this.visibleCalendarIds.set(new Set([calendarId]));
  }

  /** Seleciona exclusivamente apenas esta agenda */
  selectOnly(calendarId: string): void {
    this.visibleCalendarIds.set(new Set([calendarId]));
  }

  /** Seleciona todas as agendas */
  selectAll(): void {
    const firstId = this.calendars()[0]?.id;
    this.visibleCalendarIds.set(new Set(firstId ? [firstId] : []));
  }

  /** Desmarca todas as agendas */
  deselectAll(): void {
    this.selectAll();
  }

  /** Verifica se todas estão selecionadas */
  isAllSelected(): boolean {
    const all = this.calendars();
    if (all.length === 0) return false;
    const current = this.visibleCalendarIds();
    return all.every(c => current.has(c.id));
  }

  /** Verifica se apenas uma específica está selecionada */
  isOnlySelected(calendarId: string): boolean {
    const current = this.visibleCalendarIds();
    return current.size === 1 && current.has(calendarId);
  }

  /** Verifica se o usuário pode editar (owner/editor) */
  canEdit(calendarId: string): boolean {
    const cal = this.calendars().find(c => c.id === calendarId);
    if (!cal || cal.isTaskCalendar) return false;
    return ['owner', 'editor'].includes(cal.my_permission ?? 'viewer');
  }

  /** Verifica se o usuário é dono */
  isOwner(calendarId: string): boolean {
    const cal = this.calendars().find(c => c.id === calendarId);
    return !cal?.isTaskCalendar && cal?.my_permission === 'owner';
  }

  /** Enriquece membros com dados dos usuários da API corporativa */
  enrichMembersWithUserData(members: CalendarMember[], allUsers: UserResponse[]): CalendarMember[] {
    return members.map(m => {
      const user = allUsers.find(u => u.id === m.user_id);
      return {
        ...m,
        userName: user?.name ?? m.userName ?? m.user_id,
        userEmail: user?.email ?? m.userEmail,
        userAvatar: user?.avatar ?? m.userAvatar,
      };
    });
  }

  /** Sincroniza agenda específica do backend (chamada pelo SyncService) */
  syncCalendar(calendarId: string): void {
    this.http.get<Calendar[]>(`${getBackendUrl()}/api/calendars`, { headers: this.headers })
      .pipe(catchError(() => of(null)))
      .subscribe(cals => {
        if (cals) this.calendars.set(cals.map(calendar => ({
          ...calendar,
          members: this.enrichMembersWithUserData(calendar.members || [], this.authService.allUsers()),
        })));
      });
  }

  getBackendUrl(): string {
    return getBackendUrl();
  }
}
