import { Component, Inject, OnInit, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { finalize } from 'rxjs/operators';
import { of, delay } from 'rxjs';

import { EventsService } from '../../../core/services/events.service';
import { HolidaysService } from '../../../core/services/holidays.service';
import { CalendarsService } from '../../../core/services/calendars.service';
import { CalendarEvent, EventColor, EVENT_COLOR_MAP, EVENT_COLOR_LABELS } from '../../../core/models/event.model';
import { Holiday } from '../../../core/models/holiday.model';

export interface EventModalData {
  event?: CalendarEvent;
  defaultDate?: string;
  targetCalendarIds?: string[];
}

@Component({
  selector: 'app-event-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './event-modal.component.html',
  styleUrl: './event-modal.component.scss'
})
export class EventModalComponent implements OnInit {
  private calendarsService = inject(CalendarsService);
  isEdit = false;

  // ── Skill: Button HTTP Loading ──
  loadingSalvar = false;
  // A seção legada de participantes permanece desativada no template.
  readonly allUsers = signal<any[]>([]);
  readonly defaultAvatar = '';

  // Form
  formData: Omit<CalendarEvent, 'id'> = {
    calendarId: '',
    title: '',
    description: '',
    date: '',
    endDate: '',
    startTime: '09:00',
    endTime: '10:00',
    color: 'indigo',
    category: 'Geral',
    allDay: false,
  };

  holidayWarning: string | null = null;
  holidays: Holiday[] = [];

  readonly colorMap = EVENT_COLOR_MAP;
  readonly colorLabels = EVENT_COLOR_LABELS;
  readonly colorOptions = Object.keys(EVENT_COLOR_MAP) as EventColor[];

  readonly categories = [
    'Geral', 'Reunião', 'Prazo', 'Tarefas', 'Treinamento', 'Evento', 'Feriado', 'Outro'
  ];

  showDuplicateOptions = false;
  duplicateCalendarIds = signal<Set<string>>(new Set());
  readonly duplicateCalendars = computed(() => {
    const event = this.data?.event;
    if (!event) return [];
    const group = event.copyGroupId || event.id;
    return this.calendarsService.calendars().filter(calendar =>
      calendar.id !== event.calendarId && this.calendarsService.canEdit(calendar.id) &&
      !this.eventsService.events().some(item => item.calendarId === calendar.id && (item.copyGroupId || item.id) === group)
    );
  });

  get hasTargetCalendars(): boolean {
    return this.isEdit || (this.data.targetCalendarIds?.length ?? 0) > 0;
  }

  constructor(
    public dialogRef: MatDialogRef<EventModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: EventModalData,
    private eventsService: EventsService,
    private holidaysService: HolidaysService,
  ) {}

  ngOnInit(): void {
    if (this.data?.event) {
      this.isEdit = true;
      this.formData = {
        ...this.data.event,
        endDate: this.data.event.endDate || this.data.event.date,
      };
    } else {
      if (this.data?.defaultDate) {
        this.formData.date = this.data.defaultDate;
        this.formData.endDate = this.data.defaultDate;
      }
      if (this.data?.targetCalendarIds?.[0]) this.formData.calendarId = this.data.targetCalendarIds[0];
    }
    this.loadHolidays();
  }

  toggleDuplicateCalendar(calendarId: string): void {
    this.duplicateCalendarIds.update(ids => {
      const next = new Set(ids);
      next.has(calendarId) ? next.delete(calendarId) : next.add(calendarId);
      return next;
    });
  }

  toggleAttendee(_userId: string): void {}
  isAttendeeSelected(_userId: string): boolean { return false; }

  duplicateToSelectedCalendars(): void {
    if (!this.data?.event || this.duplicateCalendarIds().size === 0) return;
    const { id, ...event } = this.data.event;
    this.eventsService.createInCalendars({ ...event, copyGroupId: event.copyGroupId || id }, [...this.duplicateCalendarIds()]);
    this.duplicateCalendarIds.set(new Set());
    this.showDuplicateOptions = false;
  }

  onDateChange(): void {
    if (!this.formData.endDate || this.formData.endDate < this.formData.date) {
      this.formData.endDate = this.formData.date;
    }
    this.checkHoliday();
  }

  loadHolidays(): void {
    const year = this.formData.date ? parseInt(this.formData.date.slice(0, 4), 10) : new Date().getFullYear();
    this.holidaysService.getHolidays(year).subscribe(h => {
      this.holidays = h;
      this.checkHoliday();
    });
  }

  checkHoliday(): void {
    if (!this.formData.date) {
      this.holidayWarning = null;
      return;
    }
    const found = this.holidays.find(h => h.date === this.formData.date);
    this.holidayWarning = found ? `🎌 Atenção: ${found.name} (${found.type})` : null;
  }

  // ── Skill: Button HTTP Loading — finalize() garante reset do loading ──
  salvar(): void {
    if (!this.formData.title.trim() || !this.formData.date || !this.hasTargetCalendars) return;

    this.loadingSalvar = true;

    // Normaliza endDate se for vazio ou anterior a date
    const finalEndDate = (!this.formData.endDate || this.formData.endDate < this.formData.date)
      ? this.formData.date
      : this.formData.endDate;

    const payload = {
      ...this.formData,
      endDate: finalEndDate,
      title: this.formData.title.trim(),
    };

    of(null).pipe(
      delay(300),
      finalize(() => {
        this.loadingSalvar = false;
      })
    ).subscribe(() => {
      if (this.isEdit && this.data.event) {
        this.eventsService.update(this.data.event.id, payload);
      } else {
        const targets = this.data.targetCalendarIds || [];
        this.eventsService.createInCalendars(payload, targets);
      }
      this.dialogRef.close(true);
    });
  }

  excluir(): void {
    if (this.isEdit && this.data.event) {
      this.eventsService.remove(this.data.event.id);
      this.dialogRef.close(true);
    }
  }
}
