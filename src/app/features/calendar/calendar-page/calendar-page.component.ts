import { Component, OnInit, OnDestroy, ViewChild, inject, computed, signal, effect } from '@angular/core';
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
import { InvitationsService, CalendarInvitation } from '../../../core/services/invitations.service';
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
import { ThemeService } from '../../../core/services/theme.service';
import { KanbanBoardComponent } from '../../tasks/kanban-board/kanban-board.component';
import { KanbanService } from '../../../core/services/kanban.service';

export type CalendarView = 'month' | 'week' | 'day';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [
    CommonModule, MatDialogModule, MatIconModule, MatTooltipModule,
    MonthViewComponent, WeekViewComponent, DayViewComponent,
    MiniCalendarComponent, ThemeToggleComponent, CalendarManagerComponent, KanbanBoardComponent,
  ],
  templateUrl: './calendar-page.component.html',
  styleUrl: './calendar-page.component.scss',
})
export class CalendarPageComponent implements OnInit, OnDestroy {
  @ViewChild(KanbanBoardComponent) private kanbanBoard?: KanbanBoardComponent;
  private dialog = inject(MatDialog);
  private eventsService = inject(EventsService);
  private holidaysService = inject(HolidaysService);
  public authService = inject(AuthService);
  public calendarsService = inject(CalendarsService);
  public syncService = inject(SyncService);
  public invitationsService = inject(InvitationsService);
  public kanbanService = inject(KanbanService);
  private router = inject(Router);
  readonly themeService = inject(ThemeService);

  readonly defaultAvatar = DEFAULT_AVATAR;

  // ── Estado ──
  currentView: CalendarView = 'month';
  activeSection: 'calendar' | 'tasks' = 'calendar';
  selectedDate = new Date();
  holidays: Holiday[] = [];
  private selectedDateVersion = signal(0);
  private holidaysVersion = signal(0);

  // ── Modal de agendas ──
  showCalendarManager = false;
  editingCalendar: Calendar | null = null;
  calendarDeleteTarget: Calendar | null = null;

  readonly events = this.eventsService.events;
  /** Eventos exibidos, incluindo os pagamentos padrão da Minha Agenda. */
  readonly displayedEvents = computed<CalendarEvent[]>(() => {
    this.selectedDateVersion();
    this.holidaysVersion();
    const seen = new Set<string>();
    return [...this.events(), ...this.getPaymentEvents()].filter(event => {
      // Cópias só são unidas enquanto todos os dados visuais forem iguais.
      // Qualquer edição em uma agenda (datas, título, horário, cor etc.) a torna independente na tela.
      const dayTimes = Object.entries(event.dayTimes || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, times]) => `${day}:${times.startTime}-${times.endTime}`)
        .join('|');
      const state = [event.title, event.description, event.date, event.endDate || event.date,
        event.startTime, event.endTime, event.color, event.category, event.allDay, dayTimes].join('~');
      const key = `${event.copyGroupId || event.id}~${state}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
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
        this.invitationsService.load();
        this.kanbanService.loadTeamInvitations();
        setTimeout(() => {
          const id = [...this.calendarsService.visibleCalendarIds()][0];
          if (id) this.selectOnlyCalendar(id);
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
      const id = [...this.calendarsService.visibleCalendarIds()][0];
      if (id) this.selectOnlyCalendar(id);
    }, 600);
  }

  toggleCalendarVisibility(calendarId: string): void {
    this.selectOnlyCalendar(calendarId);
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
    const id = [...this.calendarsService.visibleCalendarIds()][0];
    if (id) this.selectOnlyCalendar(id);
  }

  deselectAllCalendars(): void {
    this.selectAllCalendars();
  }

  removeCalendar(cal: Calendar): void {
    this.calendarDeleteTarget = cal;
  }

  cancelCalendarDelete(): void {
    this.calendarDeleteTarget = null;
  }

  confirmCalendarDelete(): void {
    const calendar = this.calendarDeleteTarget;
    if (!calendar) return;
    this.calendarDeleteTarget = null;
    this.eventsService.unloadCalendar(calendar.id);
    this.calendarsService.remove(calendar.id);
    setTimeout(() => {
      const nextId = [...this.calendarsService.visibleCalendarIds()][0];
      if (nextId) this.selectOnlyCalendar(nextId);
    }, 150);
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
    this.selectedDateVersion.update(value => value + 1);
    this.loadHolidays(this.selectedDate.getFullYear());
  }

  navigate(dir: -1 | 1): void {
    const d = new Date(this.selectedDate);
    if (this.currentView === 'month') d.setMonth(d.getMonth() + dir);
    else if (this.currentView === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    this.selectedDate = d;
    this.selectedDateVersion.update(value => value + 1);
    this.loadHolidays(d.getFullYear());
  }

  setView(view: CalendarView): void { this.currentView = view; }
  setSection(section: 'calendar' | 'tasks'): void { this.activeSection = section; }
  openTaskCreate(): void {
    this.activeSection = 'tasks';
    setTimeout(() => this.kanbanBoard?.openCreate());
  }
  onMiniCalDateSelected(date: Date): void { this.selectedDate = date; this.selectedDateVersion.update(value => value + 1); this.loadHolidays(date.getFullYear()); }
  onMiniCalMonthChanged(date: Date): void { this.loadHolidays(date.getFullYear()); }

  // ── Modal de eventos ──
  openCreateModal(defaultDate?: string): void {
    const targetCalendarIds = this.calendarsService.calendars()
      .filter(cal => this.calendarsService.visibleCalendarIds().has(cal.id) && this.calendarsService.canEdit(cal.id))
      .map(cal => cal.id);
    this.dialog.open(EventModalComponent, {
      width: '600px', maxWidth: '98vw',
      data: { defaultDate, targetCalendarIds } satisfies EventModalData,
      panelClass: 'agenda-dialog',
      disableClose: true,
    });
  }

  openEditModal(event: CalendarEvent): void {
    if (event.isSystem) return;
    this.dialog.open(EventModalComponent, {
      width: '600px', maxWidth: '98vw',
      data: { event } satisfies EventModalData,
      panelClass: 'agenda-dialog',
      disableClose: true,
    });
  }

  onEventDrop(payload: { eventId: string; oldDate: string; oldEndDate?: string; newDate: string; newStartTime?: string; newEndTime?: string }): void {
    if (payload.eventId.startsWith('system-payment-') || this.events().find(event => event.id === payload.eventId)?.isSystem) return;
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

  respondToInvitation(invitation: CalendarInvitation, accept: boolean): void {
    this.invitationsService.respond(invitation, accept, () => {
      if (accept) this.calendarsService.loadAll();
    });
  }

  private loadHolidays(year: number): void {
    this.holidaysService.getHolidays(year).subscribe({
      next: h => { this.holidays = h; this.holidaysVersion.update(value => value + 1); },
      error: () => { this.holidays = []; this.holidaysVersion.update(value => value + 1); },
    });
  }

  private getPaymentEvents(): CalendarEvent[] {
    const currentUserId = this.currentUser()?.id;
    const defaultCalendar = this.calendars().find(calendar =>
      calendar.owner_id === currentUserId && calendar.name === 'Minha Agenda' &&
      this.calendarsService.visibleCalendarIds().has(calendar.id)
    );
    if (!defaultCalendar) return [];

    const year = this.selectedDate.getFullYear();
    const holidayDates = new Set(this.holidays.map(holiday => holiday.date));
    const toDateString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const isHoliday = (date: Date) => holidayDates.has(toDateString(date));
    const fifthBusinessDay = (month: number) => {
      let businessDays = 0;
      for (let day = 1; ; day++) {
        const date = new Date(year, month, day);
        if (date.getDay() !== 0 && !isHoliday(date) && ++businessDays === 5) return date;
      }
    };
    const salaryAdvanceDay = (month: number) => {
      const date = new Date(year, month, 20);
      while (date.getDay() === 0 || date.getDay() === 6 || isHoliday(date)) date.setDate(date.getDate() + 1);
      return date;
    };

    return Array.from({ length: 12 }, (_, month) => [
      { id: `system-payment-fifth-${year}-${month}`, date: fifthBusinessDay(month), title: 'Pagamento, vale alimentação e transporte' },
      { id: `system-payment-advance-${year}-${month}`, date: salaryAdvanceDay(month), title: 'Adiantamento salarial e vale transporte' },
    ]).flat().map(item => {
      const date = toDateString(item.date);
      return {
        id: item.id,
        calendarId: defaultCalendar.id,
        title: item.title,
        description: 'Evento padrão de pagamento.',
        date,
        endDate: date,
        startTime: '00:00',
        endTime: '23:59',
        color: 'emerald' as const,
        category: 'Financeiro',
        allDay: true,
        isSystem: true,
      };
    });
  }
}
