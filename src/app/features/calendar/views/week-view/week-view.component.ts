import {
  Component, Input, Output, EventEmitter, OnChanges, OnInit, OnDestroy, SimpleChanges, inject, NgZone, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CalendarEvent, EVENT_COLOR_MAP } from '../../../../core/models/event.model';
import { Holiday } from '../../../../core/models/holiday.model';
import { resolveDayOverlaps, PositionedEvent, timeToMinutes, minutesToTime } from '../../../../core/utils/overlap.util';
import { EventsService } from '../../../../core/services/events.service';

export interface EventDropPayload {
  eventId: string;
  newDate: string;
  newStartTime?: string;
  newEndTime?: string;
}

interface WeekDay {
  date: Date;
  dateStr: string;
  dayNum: number;
  dayLabel: string;
  isToday: boolean;
  isWeekend: boolean;
  holiday: Holiday | null;
  positionedEvents: PositionedEvent[];
}

@Component({
  selector: 'app-week-view',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  templateUrl: './week-view.component.html',
  styleUrl: './week-view.component.scss',
})
export class WeekViewComponent implements OnInit, OnChanges, OnDestroy {
  private eventsService = inject(EventsService);
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  @Input() selectedDate: Date = new Date();
  @Input() events: CalendarEvent[] = [];
  @Input() holidays: Holiday[] = [];
  @Output() dayClick = new EventEmitter<string>();
  @Output() eventClick = new EventEmitter<CalendarEvent>();
  @Output() eventDrop = new EventEmitter<EventDropPayload>();

  readonly colorMap = EVENT_COLOR_MAP;
  readonly DAYS_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  readonly HOURS = Array.from({ length: 24 }, (_, i) => i);

  weekDays: WeekDay[] = [];
  currentTimeTop = 0;
  private timeInterval: ReturnType<typeof setInterval> | null = null;

  // Estado de arrasto
  private draggingEvent: CalendarEvent | null = null;
  private dragOffsetY = 0;

  // Estado de redimensionamento em tempo real
  isResizing = false;
  resizingEventId: string | null = null;

  ngOnInit(): void {
    this.build();
    this.updateCurrentTime();
    this.timeInterval = setInterval(() => this.updateCurrentTime(), 60000);
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.build();
    this.updateCurrentTime();
  }

  ngOnDestroy(): void {
    if (this.timeInterval) clearInterval(this.timeInterval);
  }

  /* ── Redimensionamento Manual em Tempo Real (Resize Handle) ── */
  onResizeStart(mouseEvent: MouseEvent, event: PositionedEvent, columnElement: HTMLElement, edge: 'top' | 'bottom' = 'bottom'): void {
    mouseEvent.stopPropagation();
    mouseEvent.preventDefault();

    this.isResizing = true;
    this.resizingEventId = event.id;
    document.body.classList.add('resizing-active');

    const startMins = timeToMinutes(event.startTime);
    const endMins = timeToMinutes(event.endTime);
    const rect = columnElement.getBoundingClientRect();

    const onMouseMove = (moveEvent: MouseEvent) => {
      const relY = moveEvent.clientY - rect.top;
      const rawMin = Math.max(0, Math.min(24 * 60, relY)); // 1px = 1minuto
      const snappedMin = Math.round(rawMin / 15) * 15;

      let changed = false;

      if (edge === 'bottom') {
        const clampedEndMin = Math.max(startMins + 15, Math.min(24 * 60, snappedMin));
        const newEndTime = minutesToTime(clampedEndMin);

        if (newEndTime !== event.endTime) {
          event.endTime = newEndTime;
          // Atualiza também na lista original para que o resolveDayOverlaps reconstrua corretamente
          const orig = (this.events || []).find(e => e.id === event.id);
          if (orig) orig.endTime = newEndTime;
          changed = true;
        }
      } else {
        const clampedStartMin = Math.min(endMins - 15, Math.max(0, snappedMin));
        const newStartTime = minutesToTime(clampedStartMin);

        if (newStartTime !== event.startTime) {
          event.startTime = newStartTime;
          const orig = (this.events || []).find(e => e.id === event.id);
          if (orig) orig.startTime = newStartTime;
          changed = true;
        }
      }

      if (changed) {
        this.ngZone.run(() => {
          this.build(); // Re-calcula sobreposições, largura e altura instantaneamente
          this.cdr.detectChanges(); // Atualiza a visualização do DOM no mesmo frame
        });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.classList.remove('resizing-active');

      // Persiste o horário finalizado no service
      const orig = (this.events || []).find(e => e.id === event.id);
      if (orig) {
        this.eventsService.update(event.id, {
          startTime: orig.startTime,
          endTime: orig.endTime,
        });
      }

      this.ngZone.run(() => {
        setTimeout(() => {
          this.isResizing = false;
          this.resizingEventId = null;
          this.build();
          this.cdr.detectChanges();
        }, 50);
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  /* ── Drag & Drop de Eventos ── */
  onDragStart(ev: DragEvent, event: CalendarEvent): void {
    if (this.isResizing) {
      ev.preventDefault();
      return;
    }
    this.draggingEvent = event;
    this.dragOffsetY = ev.offsetY || 0;

    if (ev.dataTransfer) {
      ev.dataTransfer.setData('text/plain', event.id);
      ev.dataTransfer.effectAllowed = 'move';
    }
    (ev.target as HTMLElement).classList.add('dragging');
  }

  onDragEnd(ev: DragEvent): void {
    (ev.target as HTMLElement).classList.remove('dragging');
    this.draggingEvent = null;
    this.dragOffsetY = 0;
  }

  onDragOver(ev: DragEvent, cell: HTMLElement): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    cell.classList.add('drag-over');
  }

  onDragLeave(cell: HTMLElement): void {
    cell.classList.remove('drag-over');
  }

  onDrop(ev: DragEvent, day: WeekDay, cell: HTMLElement): void {
    ev.preventDefault();
    cell.classList.remove('drag-over');

    const eventId = ev.dataTransfer ? ev.dataTransfer.getData('text/plain') : null;
    if (!eventId) return;

    const event = this.draggingEvent || (this.events || []).find(e => e.id === eventId);

    if (event) {
      const rect = cell.getBoundingClientRect();
      const clickY = ev.clientY - rect.top;
      const targetTopY = Math.max(0, clickY - (this.dragOffsetY || 10));
      const snappedMinutes = Math.min(23 * 60 + 45, Math.max(0, Math.round(targetTopY / 15) * 15));

      const [sh, sm] = (event.startTime || '09:00').split(':').map(Number);
      const [eh, em] = (event.endTime || '10:00').split(':').map(Number);
      const origDuration = Math.max(15, ((eh || 0) * 60 + (em || 0)) - ((sh || 0) * 60 + (sm || 0)));

      const newStartHour = Math.floor(snappedMinutes / 60);
      const newStartMin = snappedMinutes % 60;

      const endMinutes = Math.min(24 * 60 - 1, snappedMinutes + origDuration);
      const newEndHour = Math.floor(endMinutes / 60);
      const newEndMin = endMinutes % 60;

      const pad = (n: number) => String(n).padStart(2, '0');
      const newStartTime = `${pad(newStartHour)}:${pad(newStartMin)}`;
      const newEndTime = `${pad(newEndHour)}:${pad(newEndMin)}`;

      this.eventDrop.emit({
        eventId: event.id,
        newDate: day.dateStr,
        newStartTime,
        newEndTime,
      });
    } else {
      this.eventDrop.emit({ eventId, newDate: day.dateStr });
    }
  }

  onCardClick(ev: MouseEvent, event: CalendarEvent): void {
    if (this.isResizing) return;
    this.eventClick.emit(event);
  }

  private build(): void {
    const today = this.toStr(new Date());
    const holidayMap = new Map((this.holidays || []).map(h => [h.date, h]));

    const d = new Date(this.selectedDate || new Date());
    d.setDate(d.getDate() - d.getDay());

    this.weekDays = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      const ds = this.toStr(cur);
      const dayEvents = (this.events || []).filter(e => e.date === ds);
      const positioned = resolveDayOverlaps(dayEvents, 60);

      this.weekDays.push({
        date: cur,
        dateStr: ds,
        dayNum: cur.getDate(),
        dayLabel: this.DAYS_LABEL[cur.getDay()],
        isToday: ds === today,
        isWeekend: cur.getDay() === 0 || cur.getDay() === 6,
        holiday: holidayMap.get(ds) ?? null,
        positionedEvents: positioned,
      });
    }

    this.updateCurrentTime();
  }

  private updateCurrentTime(): void {
    const now = new Date();
    this.currentTimeTop = now.getHours() * 60 + now.getMinutes();
  }

  toStr(d: Date): string {
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  formatHour(h: number): string {
    return h === 0 ? '' : `${String(h).padStart(2, '0')}:00`;
  }
}
