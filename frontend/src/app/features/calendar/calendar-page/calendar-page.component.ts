import { Component, OnInit, OnDestroy, ViewChild, inject, computed, signal, effect, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
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
import { NotificationSettingsComponent } from '../../notifications/notification-settings.component';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { AppLoadingService } from '../../../core/services/app-loading.service';
import { AiService } from '../../../core/services/ai.service';
import { AiAssistantComponent } from '../../../shared/components/ai-assistant/ai-assistant.component';
import { LivroAbrindoComponent } from '../../../shared/components/livro-abrindo/livro-abrindo.component';

export type CalendarView = 'month' | 'week' | 'day';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [
    CommonModule, MatDialogModule, MatIconModule, MatTooltipModule,
    MonthViewComponent, WeekViewComponent, DayViewComponent,
    MiniCalendarComponent, ThemeToggleComponent, CalendarManagerComponent, KanbanBoardComponent, NotificationSettingsComponent, AiAssistantComponent, LivroAbrindoComponent,
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
  public aiService = inject(AiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private readonly queryState = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  private openedEventId = '';
  private readonly notificationLink = effect(() => {
    const query = this.queryState();
    const eventId = query.get('evento');
    const calendarId = query.get('agenda');
    const calendars = this.calendarsService.calendars();
    const events = this.eventsService.events();
    if (!eventId) { this.openedEventId = ''; return; }
    untracked(() => {
      if (calendarId && calendars.some(calendar => calendar.id === calendarId) &&
          !this.calendarsService.visibleCalendarIds().has(calendarId)) this.selectOnlyCalendar(calendarId);
      const event = events.find(item => item.id === eventId);
      if (event && this.openedEventId !== event.id) this.openEditModal(event);
    });
  });
  readonly themeService = inject(ThemeService);
  private readonly userPreferences = inject(UserPreferencesService);
  private readonly appLoading = inject(AppLoadingService);
  private initializedUserId = '';
  private readonly authInitialization = effect(() => {
    const user = this.authService.currentUser();
    if (!user?.id || user.id === this.initializedUserId) return;
    this.initializedUserId = user.id;
    this.eventsService.currentUserId.set(user.id);
    this.calendarsService.loadAll(() => {
      const requestedId = this.route.snapshot.queryParamMap.get('agenda');
      const id = requestedId && this.calendars().some(calendar => calendar.id === requestedId)
        ? requestedId
        : [...this.calendarsService.visibleCalendarIds()][0];
      if (id) this.selectOnlyCalendar(id);
      this.appLoading.complete();
    });
    this.invitationsService.load();
    this.kanbanService.loadTeamInvitations();
  });

  readonly defaultAvatar = DEFAULT_AVATAR;

  openAiAssistant(): void { this.aiService.openAssistant(); }

  // ── Estado ──
  currentView: CalendarView = this.userPreferences.calendarView();
  activeSection: 'calendar' | 'tasks' = 'calendar';
  selectedDate = new Date();
  holidays: Holiday[] = [];
  private selectedDateVersion = signal(0);
  private holidaysVersion = signal(0);

  // ── Modal de agendas ──
  showCalendarManager = false;
  editingCalendar: Calendar | null = null;
  calendarDeleteTarget: Calendar | null = null;
  calendarDeleteLoading = false;
  readonly calendarContextMenu = signal<{ calendar: Calendar; x: number; y: number } | null>(null);
  readonly eventContextMenu = signal<{ event: CalendarEvent; x: number; y: number } | null>(null);
  readonly dayContextMenu = signal<{ date: string; x: number; y: number } | null>(null);
  readonly eventDeleteTarget = signal<CalendarEvent | null>(null);
  readonly eventDeleteLoading = signal(false);
  readonly collapsedSidebarSections = signal<Set<string>>(
    new Set(this.userPreferences.collapsedSidebarSections())
  );
  readonly agendaPillsExpanded = signal(this.userPreferences.agendaPillsExpanded());
  readonly notificationSettingsOpen = signal(false);

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
  readonly isTaskCalendarSelected = computed(() => {
    const visibleIds = this.calendarsService.visibleCalendarIds();
    return this.calendars().some(calendar => visibleIds.has(calendar.id) && calendar.isTaskCalendar);
  });
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
    this.route.paramMap.subscribe(() => {
      this.applyRouteState();
      this.loadHolidays(this.selectedDate.getFullYear());
    });
    this.syncService.connect();
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
    if (cal.isTaskCalendar) return;
    this.editingCalendar = cal;
    this.showCalendarManager = true;
  }

  closeCalendarManager(): void {
    this.showCalendarManager = false;
    this.editingCalendar = null;
  }

  onCalendarSaved(): void {
    const id = [...this.calendarsService.visibleCalendarIds()][0];
    if (id) this.selectOnlyCalendar(id);
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
    if (this.activeSection === 'calendar') {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { agenda: calendarId },
        queryParamsHandling: 'merge',
      });
    }
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
    if (cal.isDefault || cal.isTaskCalendar) return;
    this.calendarDeleteTarget = cal;
  }

  cancelCalendarDelete(): void {
    if (this.calendarDeleteLoading) return;
    this.calendarDeleteTarget = null;
  }

  confirmCalendarDelete(): void {
    const calendar = this.calendarDeleteTarget;
    if (!calendar) return;
    this.calendarDeleteLoading = true;
    this.calendarsService.remove(calendar.id, success => {
      this.calendarDeleteLoading = false;
      if (!success) return;
      this.calendarDeleteTarget = null;
      this.eventsService.unloadCalendar(calendar.id);
      const nextId = [...this.calendarsService.visibleCalendarIds()][0];
      if (nextId) this.selectOnlyCalendar(nextId);
    });
  }

  openCalendarContextMenu(mouseEvent: MouseEvent, calendar: Calendar): void {
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
    this.eventContextMenu.set(null);
    this.dayContextMenu.set(null);
    this.calendarContextMenu.set({
      calendar,
      x: Math.max(8, Math.min(mouseEvent.clientX, window.innerWidth - 206)),
      y: Math.max(8, Math.min(mouseEvent.clientY, window.innerHeight - 150)),
    });
  }

  openEventContextMenu(payload: { event: CalendarEvent; mouseEvent: MouseEvent }): void {
    const { event, mouseEvent } = payload;
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
    this.calendarContextMenu.set(null);
    this.dayContextMenu.set(null);
    this.eventContextMenu.set({
      event,
      x: Math.max(8, Math.min(mouseEvent.clientX, window.innerWidth - 218)),
      y: Math.max(8, Math.min(mouseEvent.clientY, window.innerHeight - 112)),
    });
  }

  closeCalendarContextMenus(): void {
    this.calendarContextMenu.set(null);
    this.eventContextMenu.set(null);
    this.dayContextMenu.set(null);
  }

  openDayContextMenu(payload: { date: string; mouseEvent: MouseEvent }): void {
    const { date, mouseEvent } = payload;
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
    if (this.isTaskCalendarSelected()) {
      this.closeCalendarContextMenus();
      return;
    }
    this.calendarContextMenu.set(null);
    this.eventContextMenu.set(null);
    this.dayContextMenu.set({
      date,
      x: Math.max(8, Math.min(mouseEvent.clientX, window.innerWidth - 190)),
      y: Math.max(8, Math.min(mouseEvent.clientY, window.innerHeight - 52)),
    });
  }

  createEventFromContext(date: string): void {
    this.closeCalendarContextMenus();
    this.openCreateModal(date);
  }

  selectCalendarFromContext(calendar: Calendar): void {
    this.closeCalendarContextMenus();
    this.selectOnlyCalendar(calendar.id);
  }

  editCalendarFromContext(calendar: Calendar): void {
    this.closeCalendarContextMenus();
    if (this.calendarsService.canEdit(calendar.id)) this.openEditCalendar(calendar);
  }

  deleteCalendarFromContext(calendar: Calendar): void {
    this.closeCalendarContextMenus();
    if (this.calendarsService.isOwner(calendar.id) && !calendar.isDefault) this.removeCalendar(calendar);
  }

  editEventFromContext(event: CalendarEvent): void {
    this.closeCalendarContextMenus();
    if (this.canManageEvent(event)) this.openEditModal(event);
  }

  requestEventDeletion(event: CalendarEvent): void {
    this.closeCalendarContextMenus();
    if (this.canManageEvent(event)) this.eventDeleteTarget.set(event);
  }

  cancelEventDeletion(): void {
    if (this.eventDeleteLoading()) return;
    this.eventDeleteTarget.set(null);
  }

  confirmEventDeletion(): void {
    const event = this.eventDeleteTarget();
    if (!event || !this.canManageEvent(event)) return;
    this.eventDeleteLoading.set(true);
    this.eventsService.remove(event.id, success => {
      this.eventDeleteLoading.set(false);
      if (success) this.eventDeleteTarget.set(null);
    });
  }

  canManageEvent(event: CalendarEvent): boolean {
    return !event.isSystem && !event.isTaskDeadline && this.calendarsService.canEdit(event.calendarId);
  }

  myCalendars(): Calendar[] {
    const uid = this.currentUser()?.id;
    return this.calendars().filter(c => c.owner_id === uid && !c.isTaskCalendar);
  }

  sharedCalendars(): Calendar[] {
    const uid = this.currentUser()?.id;
    return this.calendars().filter(c => c.owner_id !== uid && !c.isTaskCalendar);
  }

  taskCalendars(): Calendar[] {
    return this.calendars().filter(calendar => calendar.isTaskCalendar);
  }

  calendarDisplayName(calendar: Calendar): string {
    return calendar.isTaskCalendar && calendar.taskTeamName
      ? `${calendar.taskTeamName} · Tarefas`
      : calendar.name;
  }

  isSidebarSectionCollapsed(sectionId: string): boolean {
    return this.collapsedSidebarSections().has(sectionId);
  }

  toggleSidebarSection(sectionId: string): void {
    this.collapsedSidebarSections.update(current => {
      const next = new Set(current);
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId);
      this.userPreferences.setCollapsedSidebarSections(next);
      return next;
    });
  }

  toggleAgendaPills(): void {
    this.agendaPillsExpanded.update(expanded => {
      const next = !expanded;
      this.userPreferences.setAgendaPillsExpanded(next);
      return next;
    });
  }

  // ── Navegação ──
  goToday(): void {
    this.selectedDate = new Date();
    this.selectedDateVersion.update(value => value + 1);
    this.loadHolidays(this.selectedDate.getFullYear());
    this.navigateToCalendar();
  }

  navigate(dir: -1 | 1): void {
    const d = new Date(this.selectedDate);
    if (this.currentView === 'month') d.setMonth(d.getMonth() + dir);
    else if (this.currentView === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    this.selectedDate = d;
    this.selectedDateVersion.update(value => value + 1);
    this.loadHolidays(d.getFullYear());
    this.navigateToCalendar();
  }

  setView(view: CalendarView): void {
    this.currentView = view;
    this.userPreferences.setCalendarView(view);
    this.navigateToCalendar();
  }
  setSection(section: 'calendar' | 'tasks'): void {
    if (section === 'tasks') {
      const boardId = this.kanbanService.activeBoard()?.id;
      void this.router.navigate(boardId ? ['/tarefas', boardId] : ['/tarefas']);
      return;
    }
    this.navigateToCalendar();
  }
  openTaskCreate(): void {
    const boardId = this.kanbanService.activeBoard()?.id;
    void this.router.navigate(boardId ? ['/tarefas', boardId] : ['/tarefas'], { queryParams: { acao: 'nova-tarefa' } });
    setTimeout(() => this.kanbanBoard?.openCreate());
  }
  onMiniCalDateSelected(date: Date): void { this.selectedDate = date; this.selectedDateVersion.update(value => value + 1); this.loadHolidays(date.getFullYear()); this.navigateToCalendar(); }
  onMiniCalMonthChanged(date: Date): void { this.loadHolidays(date.getFullYear()); }

  // ── Modal de eventos ──
  openCreateModal(defaultDate?: string): void {
    if (this.isTaskCalendarSelected()) return;
    const targetCalendarIds = this.calendarsService.calendars()
      .filter(cal => this.calendarsService.visibleCalendarIds().has(cal.id) && this.calendarsService.canEdit(cal.id))
      .map(cal => cal.id);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { acao: 'novo-evento', data: defaultDate || this.toDatePath(this.selectedDate), evento: null },
      queryParamsHandling: 'merge',
    });
    const dialogRef = this.dialog.open(EventModalComponent, {
      width: '600px', maxWidth: '98vw',
      data: { defaultDate, targetCalendarIds } satisfies EventModalData,
      panelClass: 'agenda-dialog',
      disableClose: true,
    });
    dialogRef.afterClosed().subscribe(() => this.clearUrlAction());
  }

  openEditModal(event: CalendarEvent): void {
    if (event.isTaskDeadline) {
      this.openTaskFromCalendar(event);
      return;
    }
    if (event.isSystem) return;
    if (this.openedEventId === event.id && this.dialog.openDialogs.length) return;
    this.openedEventId = event.id;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { evento: event.id, acao: null, data: null },
      queryParamsHandling: 'merge',
    });
    const dialogRef = this.dialog.open(EventModalComponent, {
      width: '600px', maxWidth: '98vw',
      data: { event, readOnly: !this.calendarsService.canEdit(event.calendarId) } satisfies EventModalData,
      panelClass: 'agenda-dialog',
      disableClose: true,
    });
    dialogRef.afterClosed().subscribe(() => this.clearUrlAction());
  }

  private openTaskFromCalendar(event: CalendarEvent): void {
    if (!event.taskId || !event.taskBoardId) return;
    void this.router.navigate(['/tarefas', event.taskBoardId], {
      queryParams: {
        tarefa: event.taskId,
        ramificacao: event.taskParentId || null,
      },
    });
  }

  onEventDrop(payload: { eventId: string; oldDate: string; oldEndDate?: string; newDate: string; newStartTime?: string; newEndTime?: string }): void {
    if (payload.eventId.startsWith('system-payment-') || this.events().find(event => event.id === payload.eventId)?.isSystem) return;
    // Calcula o delta em dias entre a data original e a nova data
    const oldMs = new Date(payload.oldDate + 'T00:00:00Z').getTime();
    const newMs = new Date(payload.newDate + 'T00:00:00Z').getTime();
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

  private applyRouteState(): void {
    const path = this.router.url.split('?')[0];
    if (path.startsWith('/tarefas')) {
      this.activeSection = 'tasks';
      return;
    }

    this.activeSection = 'calendar';
    const viewParam = this.route.snapshot.paramMap.get('view');
    const views: Record<string, CalendarView> = { mes: 'month', semana: 'week', dia: 'day' };
    if (viewParam && views[viewParam]) {
      this.currentView = views[viewParam];
      this.userPreferences.setCalendarView(this.currentView);
    }

    const dateParam = this.route.snapshot.paramMap.get('date');
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [year, month, day] = dateParam.split('-').map(Number);
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime()) && this.toDatePath(parsed) !== this.toDatePath(this.selectedDate)) {
        this.selectedDate = parsed;
        this.selectedDateVersion.update(value => value + 1);
      }
    }

    if (!viewParam || !dateParam) this.navigateToCalendar(true);
  }

  private navigateToCalendar(replaceUrl = false): void {
    this.activeSection = 'calendar';
    const viewSlug: Record<CalendarView, string> = { month: 'mes', week: 'semana', day: 'dia' };
    const agendaId = this.route.snapshot.queryParamMap.get('agenda')
      || [...this.calendarsService.visibleCalendarIds()][0];
    void this.router.navigate(['/calendario', viewSlug[this.currentView], this.toDatePath(this.selectedDate)], {
      replaceUrl,
      queryParams: agendaId ? { agenda: agendaId } : undefined,
    });
  }

  private clearUrlAction(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: { acao: null, data: null, evento: null },
      queryParamsHandling: 'merge',
    });
  }

  private toDatePath(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private getPaymentEvents(): CalendarEvent[] {
    const currentUserId = this.currentUser()?.id;
    const defaultCalendar = this.calendars().find(calendar =>
      calendar.owner_id === currentUserId && calendar.isDefault &&
      this.calendarsService.visibleCalendarIds().has(calendar.id)
    );
    if (!defaultCalendar) return [];

    const year = this.selectedDate.getFullYear();
    const holidayDates = new Set(this.holidays.map(holiday => holiday.date));
    const toDateString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const isHoliday = (date: Date) => holidayDates.has(toDateString(date));
    const isBankingDay = (date: Date) => date.getDay() !== 0 && date.getDay() !== 6 && !isHoliday(date);
    const isWorkdayForCount = (date: Date) => date.getDay() !== 0 && !isHoliday(date);
    const fifthBusinessDay = (month: number) => {
      let businessDays = 0;
      let targetDate = new Date(year, month, 1);
      for (let day = 1; ; day++) {
        const date = new Date(year, month, day);
        if (isWorkdayForCount(date)) {
          businessDays++;
          if (businessDays === 5) {
            targetDate = date;
            break;
          }
        }
      }
      while (!isBankingDay(targetDate)) {
        targetDate.setDate(targetDate.getDate() - 1);
      }
      return targetDate;
    };
    const salaryAdvanceDay = (month: number) => {
      const date = new Date(year, month, 20);
      while (!isBankingDay(date)) {
        date.setDate(date.getDate() - 1);
      }
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
        attachments: [],
      };
    });
  }
}
