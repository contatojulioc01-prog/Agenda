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
  oldDate: string;
  oldEndDate?: string;
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

interface WeekEventSpan {
  event: CalendarEvent;
  startCol: number;
  span: number;
  top: number;
  height: number;
  left: number;
  width: number;
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
  @Output() dayContextMenu = new EventEmitter<{ date: string; mouseEvent: MouseEvent }>();
  @Output() eventClick = new EventEmitter<CalendarEvent>();
  @Output() eventContextMenu = new EventEmitter<{ event: CalendarEvent; mouseEvent: MouseEvent }>();
  @Output() eventDrop = new EventEmitter<EventDropPayload>();

  readonly colorMap = EVENT_COLOR_MAP;
  readonly DAYS_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  readonly HOURS = Array.from({ length: 24 }, (_, i) => i);

  weekDays: WeekDay[] = [];
  multiDaySpans: WeekEventSpan[] = [];
  currentTimeTop = 0;
  private timeInterval: ReturnType<typeof setInterval> | null = null;

  // Estado de arrasto
  private draggingEvent: CalendarEvent | null = null;
  private dragOffsetY = 0;
  private dragOverCell: HTMLElement | null = null;
  // Contador de dragenter por célula (para highlight confiável sem flickering)
  private dragEnterCounters = new WeakMap<HTMLElement, number>();

  // Estado de redimensionamento em tempo real
  isResizing = false;
  resizingEventId: string | null = null;

  ngOnInit(): void {
    this.build();
    this.updateCurrentTime();
    this.timeInterval = setInterval(() => this.updateCurrentTime(), 60000);
    this.injectScrollbarWidth();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.build();
    this.updateCurrentTime();
  }

  ngOnDestroy(): void {
    if (this.timeInterval) clearInterval(this.timeInterval);
  }

  /** Mede a largura da scrollbar do SO e injeta como variável CSS para alinhar header com body */
  private injectScrollbarWidth(): void {
    const outer = document.createElement('div');
    outer.style.cssText = 'visibility:hidden;overflow:scroll;position:absolute;top:-9999px;';
    document.body.appendChild(outer);
    const inner = document.createElement('div');
    outer.appendChild(inner);
    const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;
    document.body.removeChild(outer);
    document.documentElement.style.setProperty('--scrollbar-width', scrollbarWidth + 'px');
  }

  /* ── Redimensionamento Manual em Tempo Real (Resize Handle) ── */
  onResizeStart(mouseEvent: MouseEvent, event: PositionedEvent, columnElement: HTMLElement, edge: 'top' | 'bottom' = 'bottom', dayDateStr?: string): void {
    mouseEvent.stopPropagation();
    mouseEvent.preventDefault();
    if (event.isSystem) return;

    this.isResizing = true;
    this.resizingEventId = event.id;
    document.body.classList.add('resizing-active');

    const targetDateStr = dayDateStr || event.date;
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
          this.build(); // Re-calcula sobreposições, largura e altura instantaneamente
          this.cdr.detectChanges(); // Atualiza a visualização do DOM no mesmo frame
        });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.classList.remove('resizing-active');

      // Persiste o horário do dia específico no service
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

  /* ── Redimensionamento Horizontal entre Dias (Esquerda / Direita) ── */
  onResizeHorizontalStart(mouseEvent: MouseEvent, event: CalendarEvent, edge: 'left' | 'right'): void {
    mouseEvent.stopPropagation();
    mouseEvent.preventDefault();
    if (event.isSystem) return;

    this.isResizing = true;
    this.resizingEventId = event.id;
    document.body.classList.add('resizing-x-active');

    const onMouseMove = (moveEvent: MouseEvent) => {
      const clientX = moveEvent.clientX;

      // Localiza a coluna do dia sobre a qual o mouse está passando
      let targetDayStr: string | null = null;
      for (const day of this.weekDays) {
        const colEl = document.querySelector(`[data-date="${day.dateStr}"]`) as HTMLElement;
        if (colEl) {
          const rect = colEl.getBoundingClientRect();
          if (clientX >= rect.left && clientX <= rect.right) {
            targetDayStr = day.dateStr;
            break;
          }
        }
      }

      if (!targetDayStr) return;

      let changed = false;

      if (edge === 'right') {
        // Redimensiona término para a direita/esquerda
        const currentStartDate = event.date;
        const newEndDate = targetDayStr >= currentStartDate ? targetDayStr : currentStartDate;

        if (newEndDate !== (event.endDate || event.date)) {
          event.endDate = newEndDate;
          const orig = (this.events || []).find(e => e.id === event.id);
          if (orig) orig.endDate = newEndDate;
          changed = true;
        }
      } else {
        // Redimensiona início para a esquerda/direita
        const currentEndDate = event.endDate || event.date;
        const newStartDate = targetDayStr <= currentEndDate ? targetDayStr : currentEndDate;

        if (newStartDate !== event.date) {
          event.date = newStartDate;
          const orig = (this.events || []).find(e => e.id === event.id);
          if (orig) orig.date = newStartDate;
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
      document.body.classList.remove('resizing-x-active');

      const orig = (this.events || []).find(e => e.id === event.id);
      if (orig) {
        this.eventsService.update(event.id, {
          date: orig.date,
          endDate: orig.endDate || orig.date,
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
    if (this.isResizing || event.isSystem) {
      ev.preventDefault();
      return;
    }
    this.draggingEvent = event;

    const target = ev.target as HTMLElement;
    const card = target ? (target.closest('.week-event') as HTMLElement) || target : null;
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
    const card = target ? (target.closest('.week-event') as HTMLElement) || target : null;
    if (card) card.classList.remove('dragging');
    this.draggingEvent = null;
    this.dragOffsetY = 0;
    document.body.classList.remove('dragging-active');
    // Limpa highlight e contadores residuais
    if (this.dragOverCell) {
      this.dragOverCell.classList.remove('drag-over');
      this.dragEnterCounters.set(this.dragOverCell, 0);
      this.dragOverCell = null;
    }
  }

  onDragEnter(ev: DragEvent, cell: HTMLElement): void {
    ev.preventDefault();
    if (!cell) return;
    const count = (this.dragEnterCounters.get(cell) ?? 0) + 1;
    this.dragEnterCounters.set(cell, count);
    if (count === 1) {
      // Saindo de outra coluna — limpa highlight anterior
      if (this.dragOverCell && this.dragOverCell !== cell) {
        this.dragOverCell.classList.remove('drag-over');
        this.dragEnterCounters.set(this.dragOverCell, 0);
      }
      cell.classList.add('drag-over');
      this.dragOverCell = cell;
    }
  }

  onDragOver(ev: DragEvent, cell: HTMLElement): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  }

  onDragLeave(ev: DragEvent, cell: HTMLElement): void {
    if (!cell) return;
    const count = Math.max(0, (this.dragEnterCounters.get(cell) ?? 0) - 1);
    this.dragEnterCounters.set(cell, count);
    if (count === 0) {
      cell.classList.remove('drag-over');
      if (this.dragOverCell === cell) this.dragOverCell = null;
    }
  }

  onDrop(ev: DragEvent, day: WeekDay, cell: HTMLElement): void {
    ev.preventDefault();
    ev.stopPropagation();
    document.body.classList.remove('dragging-active');
    if (cell) {
      cell.classList.remove('drag-over');
      this.dragEnterCounters.set(cell, 0);
    }
    if (this.dragOverCell === cell) this.dragOverCell = null;

    const eventId = (ev.dataTransfer ? ev.dataTransfer.getData('text/plain') : null) || this.draggingEvent?.id;
    if (!eventId) return;

    const event = this.draggingEvent || (this.events || []).find(e => e.id === eventId);

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

      this.eventDrop.emit({
        eventId: event.id,
        oldDate: event.date,
        oldEndDate: event.endDate || event.date,
        newDate: day.dateStr,
        newStartTime,
        newEndTime,
      });
    } else {
      const fallback = (this.events || []).find(e => e.id === eventId);
      this.eventDrop.emit({
        eventId,
        oldDate: fallback?.date || day.dateStr,
        oldEndDate: fallback?.endDate || fallback?.date,
        newDate: day.dateStr,
      });
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

    const weekDates = Array.from({ length: 7 }, (_, i) => this.toStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)));
    const weekStart = weekDates[0];
    const weekEnd = weekDates[6];
    this.multiDaySpans = (this.events || [])
      .filter(event => {
        const end = event.endDate || event.date;
        return end !== event.date && event.date <= weekEnd && end >= weekStart;
      })
      .map(event => {
        const end = event.endDate || event.date;
        const startCol = event.date < weekStart ? 0 : weekDates.indexOf(event.date);
        const endCol = end > weekEnd ? 6 : weekDates.indexOf(end);
        const start = timeToMinutes(event.startTime || '09:00');
        const finish = Math.max(start + 15, timeToMinutes(event.endTime || '10:00'));
        const span = endCol - startCol + 1;
        return {
          event, startCol, span, top: start, height: Math.max(22, finish - start),
          left: (startCol / 7) * 100, width: (span / 7) * 100,
        };
      });

    this.weekDays = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      const ds = this.toStr(cur);
      const dayEvents = (this.events || [])
        .filter(e => e.date <= ds && (e.endDate || e.date) >= ds && (e.endDate || e.date) === e.date)
        .map(e => {
          const daySchedule = e.dayTimes?.[ds];
          const st = daySchedule?.startTime || e.startTime || '09:00';
          const et = daySchedule?.endTime || e.endTime || '10:00';
          return {
            ...e,
            startTime: st,
            endTime: et,
          };
        });
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
