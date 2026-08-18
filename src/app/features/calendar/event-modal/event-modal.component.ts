import { Component, Inject, OnInit, inject } from '@angular/core';
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
import { AuthService } from '../../../core/services/auth.service';
import { CalendarEvent, EventColor, EVENT_COLOR_MAP, EVENT_COLOR_LABELS } from '../../../core/models/event.model';
import { Holiday } from '../../../core/models/holiday.model';

export interface EventModalData {
  event?: CalendarEvent;
  defaultDate?: string;
  defaultCalendarId?: string;
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
  public authService = inject(AuthService);
  isEdit = false;

  // ── Skill: Button HTTP Loading ──
  loadingSalvar = false;

  // Form
  formData: Omit<CalendarEvent, 'id'> = {
    calendarId: '',
    title: '',
    description: '',
    date: '',
    startTime: '09:00',
    endTime: '10:00',
    color: 'indigo',
    category: 'Geral',
    allDay: false,
    attendees: [],
  };

  holidayWarning: string | null = null;
  holidays: Holiday[] = [];

  readonly colorMap = EVENT_COLOR_MAP;
  readonly colorLabels = EVENT_COLOR_LABELS;
  readonly colorOptions = Object.keys(EVENT_COLOR_MAP) as EventColor[];

  readonly categories = [
    'Geral', 'Reunião', 'Prazo', 'Treinamento', 'Evento', 'Feriado', 'Outro'
  ];

  readonly allUsers = this.authService.allUsers;

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
        attendees: this.data.event.attendees ? [...this.data.event.attendees] : []
      };
    } else {
      if (this.data?.defaultDate) this.formData.date = this.data.defaultDate;
      if (this.data?.defaultCalendarId) this.formData.calendarId = this.data.defaultCalendarId;
    }
    this.loadHolidays();
  }

  toggleAttendee(userId: string): void {
    const list = this.formData.attendees || [];
    const index = list.indexOf(userId);
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(userId);
    }
    this.formData.attendees = [...list];
  }

  isAttendeeSelected(userId: string): boolean {
    return (this.formData.attendees || []).includes(userId);
  }

  onDateChange(): void {
    if (!this.formData.date) { this.holidayWarning = null; return; }
    const year = new Date(this.formData.date + 'T12:00').getFullYear();
    this.holidaysService.getHolidays(year).subscribe(h => {
      const holiday = this.holidaysService.isHoliday(this.formData.date, h);
      this.holidayWarning = holiday ? `⚠️ Atenção: ${holiday.name} — feriado nacional` : null;
    });
  }

  // ── Skill: Button HTTP Loading — finalize() garante reset do loading ──
  salvar(): void {
    if (this.loadingSalvar) return;
    if (!this.formData.title.trim() || !this.formData.date) return;

    this.loadingSalvar = true;

    // Simula operação assíncrona
    of(null).pipe(
      delay(350),
      finalize(() => { this.loadingSalvar = false; })
    ).subscribe(() => {
      if (this.isEdit && this.data.event) {
        this.eventsService.update(this.data.event.id, this.formData);
      } else {
        this.eventsService.create(this.formData);
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

  private loadHolidays(): void {
    const year = new Date().getFullYear();
    this.holidaysService.getHolidays(year).subscribe(h => {
      this.holidays = h;
      if (this.formData.date) this.onDateChange();
    });
  }
}
