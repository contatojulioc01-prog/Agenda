import { Injectable, signal, inject, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of, forkJoin } from 'rxjs';
import { CalendarEvent, EventColor } from '../models/event.model';

function generateUniqueId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch { /* fallback */ }
  }
  return 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

function getBackendUrl(): string {
  return '';
}

@Injectable({ providedIn: 'root' })
export class EventsService {
  private http = inject(HttpClient);

  /** Todos os eventos carregados (de todas as agendas visíveis) */
  events = signal<CalendarEvent[]>([]);

  /** IDs de agendas já carregadas para evitar recargas desnecessárias */
  private loadedCalendarIds = new Set<string>();

  /** ID do usuário atual (definido pela CalendarPageComponent) */
  currentUserId = signal<string>('');
  error = signal<string>('');

  /** Retorna eventos de uma data específica */
  getByDate(date: string): CalendarEvent[] {
    return this.events()
      .filter(e => e.date <= date && (e.endDate || e.date) >= date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  /** Retorna eventos de um mês/ano */
  getByMonth(year: number, month: number): CalendarEvent[] {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return this.events().filter(e => e.date.startsWith(prefix) || (e.endDate && e.endDate.startsWith(prefix)));
  }

  /** Carrega eventos de uma agenda específica do backend */
  loadFromCalendar(calendarId: string): void {
    const userId = this.currentUserId();
    if (!userId) return;

    this.http.get<CalendarEvent[]>(
      `${getBackendUrl()}/api/calendars/${calendarId}/events`,
      { headers: { 'x-user-id': userId } }
    ).pipe(
      catchError(err => {
        console.warn(`[EventsService] Erro ao carregar eventos da agenda ${calendarId}:`, err.message);
        return of([] as CalendarEvent[]);
      })
    ).subscribe(remoteEvents => {
      this.loadedCalendarIds.add(calendarId);
      // Substitui eventos desta agenda e mantém das demais
      this.events.update(current => [
        ...current.filter(e => e.calendarId !== calendarId),
        ...remoteEvents,
      ]);
    });
  }

  /** Carrega eventos de múltiplas agendas */
  loadFromCalendars(calendarIds: string[]): void {
    calendarIds.forEach(id => this.loadFromCalendar(id));
  }

  /** Remove eventos de uma agenda da memória (quando a agenda é ocultada) */
  unloadCalendar(calendarId: string): void {
    this.loadedCalendarIds.delete(calendarId);
    this.events.update(list => list.filter(e => e.calendarId !== calendarId));
  }

  /** Cria novo evento no backend */
  create(event: Omit<CalendarEvent, 'id'>): void {
    const userId = this.currentUserId();
    if (!event.calendarId || !userId) {
      this.error.set('Não foi possível identificar o usuário ou a agenda para salvar no PostgreSQL.');
      return;
    }
    this.error.set('');

    this.http.post<CalendarEvent>(
      `${getBackendUrl()}/api/calendars/${event.calendarId}/events`,
      {
        title: event.title,
        description: event.description,
        date: event.date,
        endDate: event.endDate || event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        dayTimes: event.dayTimes || {},
        color: event.color,
        category: event.category,
        allDay: event.allDay,
        copyGroupId: event.copyGroupId,
      },
      { headers: { 'x-user-id': userId } }
    ).pipe(catchError(err => {
      this.error.set(err.error?.error || 'Não foi possível salvar o evento no PostgreSQL.');
      return of(null);
    }))
      .subscribe(created => {
        if (created) {
          this.events.update(list => [...list, created]);
        }
      });
  }

  /** Cria a mesma atividade em todas as agendas selecionadas. */
  createInCalendars(event: Omit<CalendarEvent, 'id'>, calendarIds: string[]): void {
    const copyGroupId = event.copyGroupId || generateUniqueId();
    [...new Set(calendarIds)].forEach(calendarId => this.create({ ...event, calendarId, copyGroupId }));
  }

  /** Atualiza evento existente no backend */
  update(id: string, changes: Partial<Omit<CalendarEvent, 'id'>>): void {
    if (this.events().find(event => event.id === id)?.isSystem) return;
    const userId = this.currentUserId();
    if (!userId) { this.error.set('Usuário não identificado para salvar no PostgreSQL.'); return; }
    this.error.set('');

    // Converte camelCase para o formato esperado pelo backend
    const body: Record<string, unknown> = {};
    if (changes.title !== undefined) body['title'] = changes.title;
    if (changes.description !== undefined) body['description'] = changes.description;
    if (changes.date !== undefined) body['date'] = changes.date;
    if (changes.endDate !== undefined) body['endDate'] = changes.endDate;
    if (changes.startTime !== undefined) body['startTime'] = changes.startTime;
    if (changes.endTime !== undefined) body['endTime'] = changes.endTime;
    if (changes.dayTimes !== undefined) body['dayTimes'] = changes.dayTimes;
    if (changes.color !== undefined) body['color'] = changes.color;
    if (changes.category !== undefined) body['category'] = changes.category;
    if (changes.allDay !== undefined) body['allDay'] = changes.allDay;

    this.http.put<CalendarEvent>(
      `${getBackendUrl()}/api/events/${id}`,
      body,
      { headers: { 'x-user-id': userId } }
    ).pipe(catchError(err => {
      this.error.set(err.error?.error || 'Não foi possível atualizar o evento no PostgreSQL.');
      return of(null);
    })).subscribe(updated => {
      if (updated) this.events.update(list => list.map(event => event.id === id ? updated : event));
    });
  }

  /** Remove evento no backend */
  remove(id: string): void {
    if (this.events().find(event => event.id === id)?.isSystem) return;
    const userId = this.currentUserId();
    if (!userId) { this.error.set('Usuário não identificado para excluir no PostgreSQL.'); return; }
    this.error.set('');
    this.http.delete(`${getBackendUrl()}/api/events/${id}`, { headers: { 'x-user-id': userId } })
      .pipe(catchError(err => {
        this.error.set(err.error?.error || 'Não foi possível excluir o evento no PostgreSQL.');
        return of(null);
      })).subscribe(result => {
        if (result) this.events.update(list => list.filter(event => event.id !== id));
      });
  }

  /** Move evento para outra data (drag & drop) */
  moveToDate(id: string, newDate: string, newStartTime?: string, newEndTime?: string): void {
    const changes: Partial<CalendarEvent> = { date: newDate };
    if (newStartTime) changes.startTime = newStartTime;
    if (newEndTime) changes.endTime = newEndTime;
    this.update(id, changes);
  }
}
