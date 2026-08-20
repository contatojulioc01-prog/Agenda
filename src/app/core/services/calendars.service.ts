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
  loadAll(): void {
    if (!this.userId || this.userId === 'anonymous') return;
    this.isLoading.set(true);
    this.error.set('');

    this.http.get<Calendar[]>(`${getBackendUrl()}/api/calendars`, { headers: this.headers })
      .pipe(
        catchError(err => {
          console.warn('[CalendarsService] PostgreSQL/backend indisponível:', err.message);
          this.error.set('Não foi possível carregar as agendas do PostgreSQL.');
          return of([] as Calendar[]);
        }),
        tap(cals => {
          const finalList = Array.isArray(cals) ? cals : [];
          this.calendars.set(finalList);

          // Tornar todas visíveis por padrão
          const currentId = [...this.visibleCalendarIds()][0];
          const selectedId = finalList.some(calendar => calendar.id === currentId) ? currentId : finalList[0]?.id;
          this.visibleCalendarIds.set(new Set(selectedId ? [selectedId] : []));
          this.isLoading.set(false);
        })
      ).subscribe();
  }

  /** Cria nova agenda */
  create(
    name: string,
    color: string,
    isPrivate: boolean,
    initialMembers: { user_id: string; permission: CalendarPermission }[] = []
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
          this.calendars.update(list => [...list, cal]);
          this.visibleCalendarIds.set(new Set([cal.id]));
        }
      });
  }

  /** Atualiza agenda existente */
  update(id: string, changes: Partial<Pick<Calendar, 'name' | 'color' | 'isPrivate'>>): void {
    this.error.set('');
    this.http.put<Calendar>(`${getBackendUrl()}/api/calendars/${id}`, changes, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Não foi possível atualizar a agenda no PostgreSQL.'); return of(null); }))
      .subscribe(updated => {
        if (updated) {
          this.calendars.update(list => list.map(c => c.id === id ? { ...c, ...updated } : c));
        }
      });
  }

  /** Remove agenda */
  remove(id: string): void {
    this.error.set('');
    this.http.delete(`${getBackendUrl()}/api/calendars/${id}`, { headers: this.headers })
      .pipe(catchError(err => { this.error.set(err.error?.error || 'Não foi possível excluir a agenda no PostgreSQL.'); return of(null); }))
      .subscribe(result => {
        if (!result) return;
        this.calendars.update(list => list.filter(c => c.id !== id));
        const remaining = this.calendars();
        const selected = [...this.visibleCalendarIds()][0];
        const nextId = selected === id || !remaining.some(calendar => calendar.id === selected) ? remaining[0]?.id : selected;
        this.visibleCalendarIds.set(new Set(nextId ? [nextId] : []));
      });
  }

  /** Adiciona membro à agenda */
  addMember(calendarId: string, userId: string, permission: CalendarPermission): void {
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
      });
  }

  /** Atualiza permissão de membro */
  updateMemberPermission(calendarId: string, memberId: string, permission: CalendarPermission): void {
    this.http.put(
      `${getBackendUrl()}/api/calendars/${calendarId}/members/${memberId}`,
      { permission },
      { headers: this.headers }
    ).pipe(catchError(err => { this.error.set(err.error?.error || 'Não foi possível atualizar a permissão.'); return of(null); }))
      .subscribe(result => {
        if (!result) return;
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
      });
  }

  /** Remove membro da agenda */
  removeMember(calendarId: string, memberId: string): void {
    this.http.delete(
      `${getBackendUrl()}/api/calendars/${calendarId}/members/${memberId}`,
      { headers: this.headers }
    ).pipe(catchError(err => { this.error.set(err.error?.error || 'Não foi possível remover o membro.'); return of(null); }))
      .subscribe(result => {
        if (!result) return;
        this.calendars.update(list =>
          list.map(c => c.id === calendarId
            ? { ...c, members: c.members.filter(m => m.id !== memberId) }
            : c
          )
        );
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
    if (!cal) return false;
    return ['owner', 'editor'].includes(cal.my_permission ?? 'viewer');
  }

  /** Verifica se o usuário é dono */
  isOwner(calendarId: string): boolean {
    const cal = this.calendars().find(c => c.id === calendarId);
    return cal?.my_permission === 'owner';
  }

  /** Enriquece membros com dados dos usuários da API corporativa */
  enrichMembersWithUserData(members: CalendarMember[], allUsers: UserResponse[]): CalendarMember[] {
    return members.map(m => {
      const user = allUsers.find(u => u.id === m.user_id);
      return {
        ...m,
        userName: user?.name ?? m.user_id,
        userEmail: user?.email,
        userAvatar: user?.avatar,
      };
    });
  }

  /** Sincroniza agenda específica do backend (chamada pelo SyncService) */
  syncCalendar(calendarId: string): void {
    this.http.get<Calendar[]>(`${getBackendUrl()}/api/calendars`, { headers: this.headers })
      .pipe(catchError(() => of(null)))
      .subscribe(cals => {
        if (cals) this.calendars.set(cals);
      });
  }

  getBackendUrl(): string {
    return getBackendUrl();
  }
}
