import {
  Component, Input, Output, EventEmitter, OnChanges, OnInit, SimpleChanges, inject, NgZone, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CalendarEvent, EVENT_COLOR_MAP } from '../../../../core/models/event.model';
import { Holiday } from '../../../../core/models/holiday.model';
import { resolveDayOverlaps, PositionedEvent, timeToMinutes, minutesToTime } from '../../../../core/utils/overlap.util';
import { EventsService } from '../../../../core/services/events.service';
import { EventDropPayload } from '../week-view/week-view.component';

@Component({
  selector: 'app-day-view',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  templateUrl: './day-view.component.html',
  styleUrl: './day-view.component.scss',
})
export class DayViewComponent implements OnInit, OnChanges {
  private eventsService = inject(EventsService);
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  @Input() selectedDate: Date = new Date();
  @Input() events: CalendarEvent[] = [];
  @Input() holidays: Holiday[] = [];
  @Output() eventClick = new EventEmitter<CalendarEvent>();
  @Output() dayContextMenu = new EventEmitter<{ date: string; mouseEvent: MouseEvent }>();
  @Output() eventContextMenu = new EventEmitter<{ event: CalendarEvent; mouseEvent: MouseEvent }>();
  @Output() eventDrop = new EventEmitter<EventDropPayload>();
  @Output() timeRangeSelected = new EventEmitter<{ date: string; startTime: string; endTime: string }>();

  readonly colorMap = EVENT_COLOR_MAP;
  readonly HOURS = Array.from({ length: 24 }, (_, i) => i);
  readonly DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  isToday = false;
  dayName = '';
  dayNum = 0;
  holiday: Holiday | null = null;
  positionedEvents: PositionedEvent[] = [];
  allDayEvents: CalendarEvent[] = [];
  currentTimeTop = 0;

  private draggingEvent: CalendarEvent | null = null;
  private dragOffsetY = 0;
  isResizing = false;
  resizingEventId: string | null = null;

  // Estado de criação por arraste
  dragSelecting = false;
  dragSelectStartMin = 0;
  dragSelectEndMin = 0;
  dragSelectTop = 0;
  dragSelectHeight = 0;

  onColMouseDown(event: MouseEvent, colRef: HTMLElement): void {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('.day-event') || target.closest('.event-resize-handle') || target.closest('.event-resize-handle-x')) return;

    const rect = colRef.getBoundingClientRect();
    const relY = event.clientY - rect.top;
    const rawMin = Math.max(0, Math.min(24 * 60, relY));
    const snappedStart = Math.floor(rawMin / 15) * 15;

    this.dragSelecting = true;
    this.dragSelectStartMin = snappedStart;
    this.dragSelectEndMin = snappedStart + 30;
    this.dragSelectTop = snappedStart;
    this.dragSelectHeight = 30;

    const onMouseMove = (moveEv: MouseEvent) => {
      if (!this.dragSelecting) return;
      const moveRelY = moveEv.clientY - rect.top;
      const currentMin = Math.max(0, Math.min(24 * 60, moveRelY));
      const snappedCur = Math.round(currentMin / 15) * 15;

      const minVal = Math.min(this.dragSelectStartMin, snappedCur);
      const maxVal = Math.max(this.dragSelectStartMin + 15, Math.max(this.dragSelectStartMin, snappedCur));

      this.dragSelectTop = minVal;
      this.dragSelectHeight = Math.max(15, maxVal - minVal);
      this.dragSelectEndMin = minVal + this.dragSelectHeight;
      this.cdr.detectChanges();
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      if (this.dragSelecting) {
        const start = minutesToTime(this.dragSelectTop);
        const end = minutesToTime(Math.min(24 * 60, this.dragSelectTop + this.dragSelectHeight));
        const selectedDate = this.toStr(this.selectedDate);

        this.dragSelecting = false;
        this.cdr.detectChanges();

        this.timeRangeSelected.emit({
          date: selectedDate,
          startTime: start,
          endTime: end,
        });
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  ngOnInit(): void {
    this.build();
    setTimeout(() => this.scrollToCurrentTime(), 150);
  }

  scrollToCurrentTime(): void {
    const container = document.querySelector('.day-body') as HTMLElement;
    if (container) {
      const targetScroll = Math.max(0, this.currentTimeTop - 200);
      container.scrollTop = targetScroll;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.build();
  }

  formatHour(h: number): string {
    return h === 0 ? '' : `${String(h).padStart(2, '0')}:00`;
  }

  /* ── Redimensionamento Manual em Tempo Real (Resize Handle) ── */
  onResizeStart(mouseEvent: MouseEvent, event: PositionedEvent, columnElement: HTMLElement, edge: 'top' | 'bottom' = 'bottom'): void {
    mouseEvent.stopPropagation();
    mouseEvent.preventDefault();
    if (event.isSystem) return;

    this.isResizing = true;
    this.resizingEventId = event.id;
    document.body.classList.add('resizing-active');

    const startMins = timeToMinutes(event.startTime);
    const endMins = timeToMinutes(event.endTime);
    const rect = columnElement.getBoundingClientRect();

    const targetDateStr = this.toStr(this.selectedDate || new Date());

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
          const orig = (this.events || []).find(e => e.id === event.id);
          if (orig) {
            orig.dayTimes = orig.dayTimes || {};
            orig.dayTimes[targetDateStr] = {
              startTime: orig.dayTimes[targetDateStr]?.startTime || event.startTime || orig.startTime || '09:00',
              endTime: newEndTime,
            };
          }
          changed = true;
        }
      } else {
        const clampedStartMin = Math.min(endMins - 15, Math.max(0, snappedMin));
        const newStartTime = minutesToTime(clampedStartMin);
        if (newStartTime !== event.startTime) {
          event.startTime = newStartTime;
          const orig = (this.events || []).find(e => e.id === event.id);
          if (orig) {
            orig.dayTimes = orig.dayTimes || {};
            orig.dayTimes[targetDateStr] = {
              startTime: newStartTime,
              endTime: orig.dayTimes[targetDateStr]?.endTime || event.endTime || orig.endTime || '10:00',
            };
          }
          changed = true;
        }
      }

      if (changed) {
        this.ngZone.run(() => {
          this.build();
          this.cdr.detectChanges();
        });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.classList.remove('resizing-active');

      const orig = (this.events || []).find(e => e.id === event.id);
      if (orig) {
        const updatedDayTimes = { ...(orig.dayTimes || {}) };
        updatedDayTimes[targetDateStr] = {
          startTime: event.startTime,
          endTime: event.endTime,
        };
        this.eventsService.update(event.id, {
          dayTimes: updatedDayTimes,
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

  /* ── Drag & Drop ── */
  private dragEnterCounters = new WeakMap<HTMLElement, number>();

  onDragStart(ev: DragEvent, event: CalendarEvent): void {
    if (this.isResizing || event.isSystem) {
      ev.preventDefault();
      return;
    }
    this.draggingEvent = event;

    const target = ev.target as HTMLElement;
    const card = target ? (target.closest('.day-event') as HTMLElement) || target : null;
    if (card) {
      const cardRect = card.getBoundingClientRect();
      this.dragOffsetY = ev.clientY - cardRect.top;
      card.classList.add('dragging');
    } else {
      this.dragOffsetY = ev.offsetY || 0;
    }

    if (ev.dataTransfer) {
      ev.dataTransfer.setData('text/plain', event.id);
      ev.dataTransfer.effectAllowed = 'move';
    }
    document.body.classList.add('dragging-active');
  }

  onDragEnd(ev: DragEvent): void {
    const target = ev.target as HTMLElement;
    const card = target ? (target.closest('.day-event') as HTMLElement) || target : null;
    if (card) card.classList.remove('dragging');
    this.draggingEvent = null;
    this.dragOffsetY = 0;
    document.body.classList.remove('dragging-active');
    this.dragEnterCounters = new WeakMap();
  }

  onDragEnter(ev: DragEvent, cell: HTMLElement): void {
    ev.preventDefault();
    if (!cell) return;
    const count = (this.dragEnterCounters.get(cell) ?? 0) + 1;
    this.dragEnterCounters.set(cell, count);
    if (count === 1) cell.classList.add('drag-over');
  }

  onDragOver(ev: DragEvent, cell: HTMLElement): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  }

  onDragLeave(ev: DragEvent, cell: HTMLElement): void {
    if (!cell) return;
    const count = Math.max(0, (this.dragEnterCounters.get(cell) ?? 0) - 1);
    this.dragEnterCounters.set(cell, count);
    if (count === 0) cell.classList.remove('drag-over');
  }

  onDrop(ev: DragEvent, cell: HTMLElement): void {
    ev.preventDefault();
    ev.stopPropagation();
    document.body.classList.remove('dragging-active');
    if (cell) {
      cell.classList.remove('drag-over');
      this.dragEnterCounters.set(cell, 0);
    }

    const eventId = (ev.dataTransfer ? ev.dataTransfer.getData('text/plain') : null) || this.draggingEvent?.id;
    if (!eventId) return;

    const event = this.draggingEvent || (this.events || []).find(e => e.id === eventId);
    const dateStr = this.toStr(this.selectedDate || new Date());

    if (event) {
      const rect = cell.getBoundingClientRect();
      const clickY = ev.clientY - rect.top;
      const offset = (this.dragOffsetY > 0 && this.dragOffsetY < rect.height) ? this.dragOffsetY : 0;
      const targetTopY = Math.max(0, clickY - offset);
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

      this.eventDrop.emit({ eventId: event.id, oldDate: event.date, oldEndDate: event.endDate || event.date, newDate: dateStr, newStartTime, newEndTime });
    }
  }

  onCardClick(ev: MouseEvent, event: CalendarEvent): void {
    if (this.isResizing) return;
    this.eventClick.emit(event);
  }

  openDayContextMenu(mouseEvent: MouseEvent): void {
    mouseEvent.preventDefault();
    this.dayContextMenu.emit({ date: this.toStr(this.selectedDate || new Date()), mouseEvent });
  }

  private build(): void {
    const d = this.selectedDate || new Date();
    const today = new Date();
    const ds = this.toStr(d);
    const todayStr = this.toStr(today);

    this.isToday = ds === todayStr;
    this.dayName = this.DAY_NAMES[d.getDay()];
    this.dayNum = d.getDate();
    this.holiday = (this.holidays || []).find(h => h.date === ds) ?? null;
    this.allDayEvents = (this.events || []).filter(e => e.date <= ds && (e.endDate || e.date) >= ds && e.allDay);

    const timedEvents = (this.events || [])
      .filter(e => e.date <= ds && (e.endDate || e.date) >= ds && !e.allDay)
      .map(e => {
        const daySchedule = e.dayTimes?.[ds];
        return {
          ...e,
          startTime: daySchedule?.startTime || e.startTime || '09:00',
          endTime: daySchedule?.endTime || e.endTime || '10:00',
        };
      });
    this.positionedEvents = resolveDayOverlaps(timedEvents, 60);

    const now = new Date();
    this.currentTimeTop = now.getHours() * 60 + now.getMinutes();
  }

  private toStr(d: Date): string {
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
