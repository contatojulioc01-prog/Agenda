import { Component, OnInit, OnDestroy, inject, computed, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { EventsService } from '../../../core/services/events.service';
import { HolidaysService } from '../../../core/services/holidays.service';
import { AuthService } from '../../../core/services/auth.service';
import { CalendarsService } from '../../../core/services/calendars.service';
import { SyncService } from '../../../core/services/sync.service';
import { Holiday } from '../../../core/models/holiday.model';
import { CalendarEvent } from '../../../core/models/event.model';
import { Calendar } from '../../../core/models/calendar.model';
import { DEFAULT_AVATAR } from '../../../core/models/user.model';

import { MonthViewComponent } from '../views/month-view/month-view.component';
import { WeekViewComponent } from '../views/week-view/week-view.component';
import { DayViewComponent } from '../views/day-view/day-view.component';
import { EventModalComponent, EventModalData } from '../event-modal/event-modal.component';
import { MiniCalendarComponent } from '../../../shared/components/mini-calendar/mini-calendar.component';
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component';
import { CalendarManagerComponent } from '../calendar-manager/calendar-manager.component';

export type CalendarView = 'month' | 'week' | 'day';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [
    CommonModule, MatDialogModule, MatIconModule, MatTooltipModule,
    MonthViewComponent, WeekViewComponent, DayViewComponent,
    MiniCalendarComponent, ThemeToggleComponent, CalendarManagerComponent,
  ],
  templateUrl: './calendar-page.component.html',
  styleUrl: './calendar-page.component.scss',
})
export class CalendarPageComponent implements OnInit, OnDestroy {
  private dialog = inject(MatDialog);
  private eventsService = inject(EventsService);
  private holidaysService = inject(HolidaysService);
  public authService = inject(AuthService);
  public calendarsService = inject(CalendarsService);
  public syncService = inject(SyncService);
  private router = inject(Router);

  readonly defaultAvatar = DEFAULT_AVATAR;

  // ── Estado ──
  currentView: CalendarView = 'month';
  selectedDate = new Date();
  holidays: Holiday[] = [];

  // ── Modal de agendas ──
  showCalendarManager = false;
  editingCalendar: Calendar | null = null;

  readonly events = this.eventsService.events;
  readonly currentUser = this.authService.currentUser;
  readonly calendars = this.calendarsService.calendars;
  readonly syncStatus = this.syncService.status;
  readonly lastSyncAt = this.syncService.lastSyncAt;

  // ── Getters de exibição ──
  get year() { return this.selectedDate.getFullYear(); }
  get month() { return this.selectedDate.getMonth(); }

  get periodLabel(): string {
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const d = this.selectedDate;
    if (this.currentView === 'month') return `${months[d.getMonth()]} ${d.getFullYear()}`;
    if (this.currentView === 'week') {
      const sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
      const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
      if (sun.getMonth() === sat.getMonth())
        return `${sun.getDate()} – ${sat.getDate()} de ${months[sun.getMonth()]} ${sun.getFullYear()}`;
      return `${sun.getDate()} ${months[sun.getMonth()]} – ${sat.getDate()} ${months[sat.getMonth()]} ${sat.getFullYear()}`;
    }
    return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
  }

  get lastSyncLabel(): string {
    const t = this.lastSyncAt();
    if (!t) return '';
    const diff = Math.round((Date.now() - t.getTime()) / 1000);
    if (diff < 5) return 'agora';
    if (diff < 60) return `há ${diff}s`;
    return `há ${Math.round(diff / 60)}min`;
  }

  ngOnInit(): void {
    this.loadHolidays(this.selectedDate.getFullYear());
    this.syncService.connect();

    // Sincroniza dados do usuário assim que disponível
    const checkUser = () => {
      const user = this.currentUser();
      if (user?.id) {
        this.eventsService.currentUserId.set(user.id);
        this.calendarsService.loadAll();
        setTimeout(() => {
          const ids = this.calendarsService.calendars().map(c => c.id);
          if (ids.length) this.eventsService.loadFromCalendars(ids);
        }, 500);
      }
    };

    checkUser();
    const interval = setInterval(() => {
      if (this.currentUser()?.id) {
        clearInterval(interval);
        checkUser();
      }
    }, 400);
  }

  ngOnDestroy(): void {
    this.syncService.disconnect();
  }

  // ── Agendas ──
  openCreateCalendar(): void {
    this.editingCalendar = null;
    this.showCalendarManager = true;
  }

  openEditCalendar(cal: Calendar): void {
    this.editingCalendar = cal;
    this.showCalendarManager = true;
  }

  closeCalendarManager(): void {
    this.showCalendarManager = false;
    this.editingCalendar = null;
  }

  onCalendarSaved(): void {
    // Recarrega eventos após criar/editar agenda
    setTimeout(() => {
      const ids = this.calendarsService.calendars().map(c => c.id);
      this.eventsService.loadFromCalendars(ids);
    }, 600);
  }

  toggleCalendarVisibility(calendarId: string): void {
    const wasVisible = this.calendarsService.visibleCalendarIds().has(calendarId);
    this.calendarsService.toggleVisibility(calendarId);
    if (wasVisible) {
      this.eventsService.unloadCalendar(calendarId);
    } else {
      this.eventsService.loadFromCalendar(calendarId);
    }
  }

  selectOnlyCalendar(calendarId: string, ev?: Event): void {
    if (ev) ev.stopPropagation();
    this.calendarsService.selectOnly(calendarId);
    // Descarrega as demais e carrega apenas a selecionada
    this.eventsService.events.update(list => list.filter(e => e.calendarId === calendarId));
    this.eventsService.loadFromCalendar(calendarId);
  }

  selectAllCalendars(): void {
    this.calendarsService.selectAll();
    const ids = this.calendarsService.calendars().map(c => c.id);
    this.eventsService.loadFromCalendars(ids);
  }

  deselectAllCalendars(): void {
    this.calendarsService.deselectAll();
    this.eventsService.events.set([]);
  }

  removeCalendar(cal: Calendar): void {
    if (confirm(`Remover a agenda "${cal.name}"? Esta ação não pode ser desfeita.`)) {
      this.eventsService.unloadCalendar(cal.id);
      this.calendarsService.remove(cal.id);
    }
  }

  myCalendars(): Calendar[] {
    const uid = this.currentUser()?.id;
    return this.calendars().filter(c => c.owner_id === uid);
  }

  sharedCalendars(): Calendar[] {
    const uid = this.currentUser()?.id;
    return this.calendars().filter(c => c.owner_id !== uid);
  }

  // ── Navegação ──
  goToday(): void {
    this.selectedDate = new Date();
    this.loadHolidays(this.selectedDate.getFullYear());
  }

  navigate(dir: -1 | 1): void {
    const d = new Date(this.selectedDate);
    if (this.currentView === 'month') d.setMonth(d.getMonth() + dir);
    else if (this.currentView === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    this.selectedDate = d;
    this.loadHolidays(d.getFullYear());
  }

  setView(view: CalendarView): void { this.currentView = view; }
  onMiniCalDateSelected(date: Date): void { this.selectedDate = date; this.loadHolidays(date.getFullYear()); }
  onMiniCalMonthChanged(date: Date): void { this.loadHolidays(date.getFullYear()); }

  // ── Modal de eventos ──
  openCreateModal(defaultDate?: string): void {
    const defaultCalId = this.calendarsService.calendars()[0]?.id;
    this.dialog.open(EventModalComponent, {
      width: '600px', maxWidth: '98vw',
      data: { defaultDate, defaultCalendarId: defaultCalId } satisfies EventModalData,
      panelClass: 'agenda-dialog',
    });
  }

  openEditModal(event: CalendarEvent): void {
    this.dialog.open(EventModalComponent, {
      width: '600px', maxWidth: '98vw',
      data: { event } satisfies EventModalData,
      panelClass: 'agenda-dialog',
    });
  }

  onEventDrop(payload: { eventId: string; oldDate: string; oldEndDate?: string; newDate: string; newStartTime?: string; newEndTime?: string }): void {
    // Calcula o delta em dias entre a data original e a nova data
    const oldMs = new Date(payload.oldDate + 'T00:00:00').getTime();
    const newMs = new Date(payload.newDate + 'T00:00:00').getTime();
    const deltaDays = Math.round((newMs - oldMs) / (1000 * 60 * 60 * 24));

    // Aplica o mesmo deslocamento ao endDate para preservar a duração do evento
    const oldEnd = payload.oldEndDate || payload.oldDate;
    const endMs = new Date(oldEnd + 'T00:00:00').getTime() + deltaDays * 24 * 60 * 60 * 1000;
    const newEndDate = new Date(endMs).toISOString().slice(0, 10);

    const changes: Record<string, string> = {
      date: payload.newDate,
      endDate: newEndDate,
    };
    if (payload.newStartTime) changes['startTime'] = payload.newStartTime;
    if (payload.newEndTime) changes['endTime'] = payload.newEndTime;

    this.eventsService.update(payload.eventId, changes);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/unauthorized']);
  }

  private loadHolidays(year: number): void {
    this.holidaysService.getHolidays(year).subscribe({
      next: h => this.holidays = h,
      error: () => this.holidays = [],
    });
  }
}
