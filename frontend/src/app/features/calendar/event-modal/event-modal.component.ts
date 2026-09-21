import { Component, Inject, OnDestroy, OnInit, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { EventsService } from '../../../core/services/events.service';
import { HolidaysService } from '../../../core/services/holidays.service';
import { CalendarsService } from '../../../core/services/calendars.service';
import { CalendarEvent, EventColor, EVENT_COLOR_MAP, EVENT_COLOR_LABELS } from '../../../core/models/event.model';
import { Holiday } from '../../../core/models/holiday.model';
import { Attachment } from '../../../core/models/attachment.model';
import { AttachmentsService } from '../../../core/services/attachments.service';
import { forkJoin } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AiTextButtonComponent } from '../../../shared/components/ai-text-button/ai-text-button.component';
import { MarkdownTextComponent } from '../../../shared/components/markdown-text/markdown-text.component';
import { MarkdownEditorComponent } from '../../../shared/components/markdown-editor/markdown-editor.component';

export interface EventModalData {
  event?: CalendarEvent;
  defaultDate?: string;
  targetCalendarIds?: string[];
  readOnly?: boolean;
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
    AiTextButtonComponent,
    MarkdownTextComponent,
    MarkdownEditorComponent,
  ],
  templateUrl: './event-modal.component.html',
  styleUrl: './event-modal.component.scss'
})
export class EventModalComponent implements OnInit, OnDestroy {
  private calendarsService = inject(CalendarsService);
  private attachmentsService = inject(AttachmentsService);
  private sanitizer = inject(DomSanitizer);
  isEdit = false;
  get isReadOnly(): boolean { return !!this.data.readOnly; }

  // ── Skill: Button HTTP Loading ──
  loadingSalvar = false;
  showDeleteConfirmation = false;
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
    attachments: [],
  };

  pendingFiles: File[] = [];
  attachmentError = '';
  readonly previewUrl = signal<string | null>(null);
  readonly previewName = signal('');
  readonly previewMimeType = signal('');
  readonly trustedPreviewUrl = signal<SafeResourceUrl | null>(null);

  holidayWarning: string | null = null;
  holidays: Holiday[] = [];
  private holidayYear: number | null = null;

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

  // ── Recorrência Mensal ──
  monthlyRecurring = false;
  recurringPreset: number | 'custom' = 12;
  customMonths: number = 12;

  get effectiveRecurringMonths(): number {
    if (this.recurringPreset === 'custom') {
      const val = Math.floor(Number(this.customMonths));
      return Number.isFinite(val) && val > 0 ? Math.min(val, 120) : 1;
    }
    return Number(this.recurringPreset) || 12;
  }

  get recurringDay(): string {
    return this.formData.date ? this.formData.date.slice(8, 10) : '01';
  }

  get hasTargetCalendars(): boolean {
    return this.isEdit || (this.data.targetCalendarIds?.length ?? 0) > 0;
  }

  constructor(
    public dialogRef: MatDialogRef<EventModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: EventModalData,
    public eventsService: EventsService,
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

  ngOnDestroy(): void { this.closePreview(); }

  get attachments(): Attachment[] { return this.formData.attachments || []; }

  selectFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const available = Math.max(0, 10 - this.attachments.length - this.pendingFiles.length);
    const selected = [...(input.files || [])].slice(0, available);
    const tooLarge = selected.find(file => file.size > 10 * 1024 * 1024);
    this.attachmentError = tooLarge ? `${tooLarge.name} excede o limite de 10 MB.` : '';
    this.pendingFiles.push(...selected.filter(file => file.size <= 10 * 1024 * 1024));
    input.value = '';
  }

  removePending(index: number): void { this.pendingFiles.splice(index, 1); }

  openAttachment(attachment: Attachment): void {
    const userId = this.eventsService.currentUserId();
    if (!attachment.previewable) return this.attachmentsService.download(attachment, userId);
    this.attachmentsService.content(attachment.id, userId).subscribe({
      next: blob => this.showPreview(URL.createObjectURL(blob), attachment.fileName, attachment.mimeType),
      error: () => this.attachmentError = 'Não foi possível abrir a imagem.',
    });
  }

  openPending(file: File): void {
    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      this.showPreview(URL.createObjectURL(file), file.name, file.type);
    }
  }

  closePreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
    this.previewName.set('');
    this.previewMimeType.set('');
    this.trustedPreviewUrl.set(null);
  }

  private showPreview(url: string, name: string, mimeType: string): void {
    this.closePreview();
    this.previewUrl.set(url);
    this.previewName.set(name);
    this.previewMimeType.set(mimeType);
    this.trustedPreviewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
  }

  deleteAttachment(attachment: Attachment): void {
    if (this.isReadOnly) return;
    this.attachmentsService.remove(attachment.id, this.eventsService.currentUserId()).subscribe({
      next: () => {
        this.formData.attachments = this.attachments.filter(item => item.id !== attachment.id);
        if (this.data.event) this.eventsService.setAttachments(this.data.event.id, this.formData.attachments);
      },
      error: error => this.attachmentError = error.error?.error || 'Não foi possível excluir o anexo.',
    });
  }

  private uploadPending(events: CalendarEvent[], onComplete: (success: boolean) => void): void {
    if (!this.pendingFiles.length) return onComplete(true);
    const userId = this.eventsService.currentUserId();
    const requests = events.flatMap(event => this.pendingFiles.map(file => this.attachmentsService.upload('event', event.id, file, userId)));
    forkJoin(requests).subscribe({
      next: uploaded => {
        events.forEach((event, index) => {
          const start = index * this.pendingFiles.length;
          this.eventsService.setAttachments(event.id, [...(event.attachments || []), ...uploaded.slice(start, start + this.pendingFiles.length)]);
        });
        this.pendingFiles = [];
        onComplete(true);
      },
      error: error => {
        this.attachmentError = error.error?.error || 'O evento foi salvo, mas não foi possível enviar todos os anexos.';
        onComplete(false);
      },
    });
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
    const year = Number(this.formData.date.slice(0, 4));
    if (year && year !== this.holidayYear) this.loadHolidays();
    else this.checkHoliday();
  }

  loadHolidays(): void {
    const year = this.formData.date ? parseInt(this.formData.date.slice(0, 4), 10) : new Date().getFullYear();
    this.holidayYear = year;
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

  get hasValidSchedule(): boolean {
    if (this.formData.allDay || !this.formData.date) return true;
    const effectiveEndDate = this.formData.endDate || this.formData.date;
    return effectiveEndDate > this.formData.date || this.formData.endTime > this.formData.startTime;
  }

  /**
   * Computa as ocorrências mensais para o número de meses selecionado.
   * Ajusta o dia se o mês de destino tiver menos dias (ex: dia 31 em fev/abr).
   */
  computeMonthlyOccurrences(startDateStr: string, endDateStr: string, count: number): Array<{ date: string; endDate: string }> {
    if (!startDateStr || count <= 0) return [];
    const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
    const [endYear, endMonth, endDay] = (endDateStr || startDateStr).split('-').map(Number);

    const startDt = new Date(Date.UTC(startYear, startMonth - 1, startDay));
    const endDt = new Date(Date.UTC(endYear, endMonth - 1, endDay));
    const durationDays = Math.max(0, Math.round((endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24)));

    const occurrences: Array<{ date: string; endDate: string }> = [];

    for (let i = 0; i < count; i++) {
      const totalMonths = (startMonth - 1) + i;
      const targetYear = startYear + Math.floor(totalMonths / 12);
      const targetMonth = totalMonths % 12; // 0-indexed

      // Último dia do mês alvo
      const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      const actualDay = Math.min(startDay, daysInTargetMonth);

      const occStartDate = new Date(Date.UTC(targetYear, targetMonth, actualDay));
      const occEndDate = new Date(Date.UTC(targetYear, targetMonth, actualDay + durationDays));

      occurrences.push({
        date: this.formatIsoDate(occStartDate),
        endDate: this.formatIsoDate(occEndDate),
      });
    }

    return occurrences;
  }

  private formatIsoDate(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ── Skill: Button HTTP Loading — finalize() garante reset do loading ──
  salvar(): void {
    if (this.isReadOnly) return;
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

    const count = this.effectiveRecurringMonths;

    const completed = (saved: CalendarEvent | CalendarEvent[] | null) => {
      if (!saved) { this.loadingSalvar = false; return; }
      this.uploadPending(Array.isArray(saved) ? saved : [saved], success => {
        this.loadingSalvar = false;
        if (success) this.dialogRef.close(true);
      });
    };

    if (this.isEdit && this.data.event) {
      if (this.monthlyRecurring && count > 1) {
        // Atualiza o evento atual e cria as ocorrências para os meses subsequentes
        this.eventsService.update(this.data.event.id, payload, updated => {
          if (!updated) { this.loadingSalvar = false; return; }
          const remainingOccurrences = this.computeMonthlyOccurrences(this.formData.date, finalEndDate, count).slice(1);
          if (remainingOccurrences.length > 0) {
            this.eventsService.createRecurringSeries(
              { ...payload, copyGroupId: this.data.event!.copyGroupId || this.data.event!.id },
              [this.data.event!.calendarId],
              remainingOccurrences,
              () => completed(updated)
            );
          } else {
            completed(updated);
          }
        });
      } else {
        this.eventsService.update(this.data.event.id, payload, completed);
      }
    } else {
      if (this.monthlyRecurring && count > 1) {
        const occurrences = this.computeMonthlyOccurrences(this.formData.date, finalEndDate, count);
        this.eventsService.createRecurringSeries(payload, this.data.targetCalendarIds || [], occurrences, completed);
      } else {
        this.eventsService.createInCalendars(payload, this.data.targetCalendarIds || [], completed);
      }
    }
  }

  excluir(): void {
    if (!this.isReadOnly && this.isEdit && this.data.event) this.showDeleteConfirmation = true;
  }

  confirmDelete(): void {
    if (!this.data.event) return;
    this.loadingSalvar = true;
    this.eventsService.remove(this.data.event.id, success => {
      this.loadingSalvar = false;
      if (success) this.dialogRef.close(true);
    });
  }
}
