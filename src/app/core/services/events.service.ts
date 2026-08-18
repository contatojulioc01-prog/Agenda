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
  if (typeof window !== 'undefined' && window.location.hostname) {
    return `http://${window.location.hostname}:9900`;
  }
  return 'http://192.168.13.244:9900';
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

  /** Retorna eventos de uma data específica */
  getByDate(date: string): CalendarEvent[] {
    return this.events()
      .filter(e => e.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  /** Retorna eventos de um mês/ano */
  getByMonth(year: number, month: number): CalendarEvent[] {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return this.events().filter(e => e.date.startsWith(prefix));
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
      // Fallback local se não houver backend
      const newEvent: CalendarEvent = { ...event, id: generateUniqueId() };
      this.events.update(list => [...list, newEvent]);
      return;
    }

    this.http.post<CalendarEvent>(
      `${getBackendUrl()}/api/calendars/${event.calendarId}/events`,
      {
        title: event.title,
        description: event.description,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        color: event.color,
        category: event.category,
        allDay: event.allDay,
      },
      { headers: { 'x-user-id': userId } }
    ).pipe(catchError(() => of(null)))
      .subscribe(created => {
        if (created) {
          this.events.update(list => [...list, created]);
        }
      });
  }

  /** Atualiza evento existente no backend */
  update(id: string, changes: Partial<Omit<CalendarEvent, 'id'>>): void {
    const userId = this.currentUserId();

    // Atualiza localmente de imediato (optimistic update)
    this.events.update(list =>
      list.map(e => (e.id === id ? { ...e, ...changes } : e))
    );

    if (!userId) return;

    // Converte camelCase para o formato esperado pelo backend
    const body: Record<string, unknown> = {};
    if (changes.title !== undefined) body['title'] = changes.title;
    if (changes.description !== undefined) body['description'] = changes.description;
    if (changes.date !== undefined) body['date'] = changes.date;
    if (changes.startTime !== undefined) body['startTime'] = changes.startTime;
    if (changes.endTime !== undefined) body['endTime'] = changes.endTime;
    if (changes.color !== undefined) body['color'] = changes.color;
    if (changes.category !== undefined) body['category'] = changes.category;
    if (changes.allDay !== undefined) body['allDay'] = changes.allDay;

    this.http.put<CalendarEvent>(
      `${getBackendUrl()}/api/events/${id}`,
      body,
      { headers: { 'x-user-id': userId } }
    ).pipe(catchError(() => of(null))).subscribe();
  }

  /** Remove evento no backend */
  remove(id: string): void {
    const userId = this.currentUserId();
    this.events.update(list => list.filter(e => e.id !== id));

    if (!userId) return;
    this.http.delete(`${getBackendUrl()}/api/events/${id}`, { headers: { 'x-user-id': userId } })
      .pipe(catchError(() => of(null))).subscribe();
  }

  /** Move evento para outra data (drag & drop) */
  moveToDate(id: string, newDate: string, newStartTime?: string, newEndTime?: string): void {
    const changes: Partial<CalendarEvent> = { date: newDate };
    if (newStartTime) changes.startTime = newStartTime;
    if (newEndTime) changes.endTime = newEndTime;
    this.update(id, changes);
  }
}
