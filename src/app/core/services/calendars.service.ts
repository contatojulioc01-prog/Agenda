import { Injectable, signal, inject, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of, tap } from 'rxjs';
import { Calendar, CalendarMember, CalendarPermission } from '../models/calendar.model';
import { AuthService } from './auth.service';
import { UserResponse } from '../models/user.model';

export function getBackendUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname) {
    return `http://${window.location.hostname}:9900`;
  }
  return 'http://192.168.13.244:9900';
}

function genLocalId(): string {
  return 'cal-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
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

    this.http.get<Calendar[]>(`${getBackendUrl()}/api/calendars`, { headers: this.headers })
      .pipe(
        catchError(err => {
          console.warn('[CalendarsService] Backend indisponível, usando agenda local:', err.message);
          return of(this.getDefaultCalendar());
        }),
        tap(cals => {
          const list = Array.isArray(cals) ? cals : this.getDefaultCalendar();

          // Se o backend não retornou nada, criar agenda padrão
          const finalList = list.length > 0 ? list : this.getDefaultCalendar();
          this.calendars.set(finalList);

          // Tornar todas visíveis por padrão
          this.visibleCalendarIds.set(new Set(finalList.map(c => c.id)));
          this.isLoading.set(false);
        })
      ).subscribe();
  }

  /** Cria nova agenda */
  create(name: string, color: string, isPrivate: boolean): void {
    this.http.post<Calendar>(`${getBackendUrl()}/api/calendars`, { name, color, isPrivate }, { headers: this.headers })
      .pipe(catchError(() => of(null)))
      .subscribe(cal => {
        if (cal) {
          this.calendars.update(list => [...list, cal]);
          this.visibleCalendarIds.update(ids => new Set([...ids, cal.id]));
        }
      });
  }

  /** Atualiza agenda existente */
  update(id: string, changes: Partial<Pick<Calendar, 'name' | 'color' | 'isPrivate'>>): void {
    this.http.put<Calendar>(`${getBackendUrl()}/api/calendars/${id}`, changes, { headers: this.headers })
      .pipe(catchError(() => of(null)))
      .subscribe(updated => {
        if (updated) {
          this.calendars.update(list => list.map(c => c.id === id ? { ...c, ...updated } : c));
        }
      });
  }

  /** Remove agenda */
  remove(id: string): void {
    this.http.delete(`${getBackendUrl()}/api/calendars/${id}`, { headers: this.headers })
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        this.calendars.update(list => list.filter(c => c.id !== id));
        this.visibleCalendarIds.update(ids => {
          ids.delete(id);
          return new Set(ids);
        });
      });
  }

  /** Adiciona membro à agenda */
  addMember(calendarId: string, userId: string, permission: CalendarPermission): void {
    this.http.post<CalendarMember>(
      `${getBackendUrl()}/api/calendars/${calendarId}/members`,
      { userId, permission },
      { headers: this.headers }
    ).pipe(catchError(() => of(null)))
      .subscribe(member => {
        if (member) {
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
    ).pipe(catchError(() => of(null)))
      .subscribe(() => {
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
    ).pipe(catchError(() => of(null)))
      .subscribe(() => {
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
    this.visibleCalendarIds.update(ids => {
      const next = new Set(ids);
      if (next.has(calendarId)) {
        next.delete(calendarId);
      } else {
        next.add(calendarId);
      }
      return next;
    });
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

  /** Agenda padrão quando backend não disponível (fallback local) */
  private getDefaultCalendar(): Calendar[] {
    return [{
      id: 'local-default',
      name: 'Minha Agenda',
      color: '#4f46e5',
      isPrivate: true,
      owner_id: this.userId,
      created_at: new Date().toISOString(),
      members: [],
      my_permission: 'owner',
    }];
  }

  getBackendUrl(): string {
    return getBackendUrl();
  }
}
