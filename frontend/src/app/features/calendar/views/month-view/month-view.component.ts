import {
  Component, Input, Output, EventEmitter, OnChanges, OnInit, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CalendarEvent, EVENT_COLOR_MAP } from '../../../../core/models/event.model';
import { Holiday } from '../../../../core/models/holiday.model';
import { EventDropPayload } from '../week-view/week-view.component';

export interface MonthDay {
  date: Date;
  dateStr: string;
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  holiday: Holiday | null;
}

export interface EventSegment {
  event: CalendarEvent;
  startCol: number; // 0 a 6
  span: number;     // 1 a 7
  isStart: boolean; // se é o início real do evento
  isEnd: boolean;   // se é o fim real do evento
  rowSlot: number;  // slot vertical (0, 1, 2...)
}

export interface MonthWeek {
  days: MonthDay[];
  segments: EventSegment[];
  maxSlot: number;
}

@Component({
  selector: 'app-month-view',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  templateUrl: './month-view.component.html',
  styleUrl: './month-view.component.scss',
})
export class MonthViewComponent implements OnInit, OnChanges {
  @Input() year: number = new Date().getFullYear();
  @Input() month: number = new Date().getMonth();
  @Input() events: CalendarEvent[] = [];
  @Input() holidays: Holiday[] = [];
  @Output() dayClick = new EventEmitter<string>();
  @Output() dayContextMenu = new EventEmitter<{ date: string; mouseEvent: MouseEvent }>();
  @Output() eventClick = new EventEmitter<CalendarEvent>();
  @Output() eventContextMenu = new EventEmitter<{ event: CalendarEvent; mouseEvent: MouseEvent }>();
  @Output() eventDrop = new EventEmitter<EventDropPayload>();

  readonly DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  readonly colorMap = EVENT_COLOR_MAP;
  readonly MAX_VISIBLE_SLOTS = 3;

  monthWeeks: MonthWeek[] = [];
  dragEventId: string | null = null;
  dayPopover: { dateStr: string; dayNum: number; events: CalendarEvent[]; x: number; y: number } | null = null;

  openDayMore(day: MonthDay, ev: MouseEvent): void {
    ev.stopPropagation();
    ev.preventDefault();
    const dayEvs = (this.events || []).filter(e => {
      const end = e.endDate || e.date;
      return e.date <= day.dateStr && end >= day.dateStr;
    });
    const x = Math.min(window.innerWidth - 300, Math.max(10, ev.clientX - 100));
    const y = Math.min(window.innerHeight - 350, Math.max(10, ev.clientY - 40));
    this.dayPopover = {
      dateStr: day.dateStr,
      dayNum: day.dayNum,
      events: dayEvs,
      x,
      y,
    };
  }

  closeDayPopover(): void {
    this.dayPopover = null;
  }

  getHiddenCountForDay(week: MonthWeek, dayCol: number, dayDateStr: string): number {
    return (this.events || []).filter(e => {
      const end = e.endDate || e.date;
      return e.date <= dayDateStr && end >= dayDateStr;
    }).length - week.segments.filter(s => s.startCol <= dayCol && (s.startCol + s.span - 1) >= dayCol && s.rowSlot < this.MAX_VISIBLE_SLOTS).length;
  }

  ngOnInit(): void {
    this.build();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.build();
  }

  private build(): void {
    const today = this.toStr(new Date());
    const holidayMap = new Map((this.holidays || []).map(h => [h.date, h]));

    const first = new Date(this.year, this.month, 1);
    const startDow = first.getDay();
    const start = new Date(this.year, this.month, 1 - startDow);

    this.monthWeeks = [];
    let cur = new Date(start);

    for (let w = 0; w < 6; w++) {
      const days: MonthDay[] = [];
      const dayDateStrings: string[] = [];

      for (let d = 0; d < 7; d++) {
        const ds = this.toStr(cur);
        dayDateStrings.push(ds);
        days.push({
          date: new Date(cur),
          dateStr: ds,
          dayNum: cur.getDate(),
          isCurrentMonth: cur.getMonth() === this.month,
          isToday: ds === today,
          isWeekend: cur.getDay() === 0 || cur.getDay() === 6,
          holiday: holidayMap.get(ds) ?? null,
        });
        cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
      }

      const weekStartStr = dayDateStrings[0];
      const weekEndStr = dayDateStrings[6];

      // Filtra eventos que aparecem nesta semana
      const weekEvents = (this.events || [])
        .filter(e => {
          const evEnd = e.endDate || e.date;
          return evEnd >= weekStartStr && e.date <= weekEndStr;
        })
        .sort((a, b) => {
          const aEnd = a.endDate || a.date;
          const bEnd = b.endDate || b.date;
          const aDur = new Date(aEnd).getTime() - new Date(a.date).getTime();
          const bDur = new Date(bEnd).getTime() - new Date(b.date).getTime();
          // Mais longos primeiro
          if (bDur !== aDur) return bDur - aDur;
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return (a.startTime || '09:00').localeCompare(b.startTime || '09:00');
        });

      // Grade de ocupação de slots para as 7 colunas
      const colSlots: boolean[][] = Array.from({ length: 7 }, () => []);
      const segments: EventSegment[] = [];
      let maxSlot = 0;

      for (const ev of weekEvents) {
        const evEnd = ev.endDate || ev.date;

        let startCol = 0;
        if (ev.date >= weekStartStr) {
          const foundIdx = dayDateStrings.indexOf(ev.date);
          if (foundIdx >= 0) startCol = foundIdx;
        }

        let endCol = 6;
        if (evEnd <= weekEndStr) {
          const foundIdx = dayDateStrings.indexOf(evEnd);
          if (foundIdx >= 0) endCol = foundIdx;
        }

        const span = Math.max(1, endCol - startCol + 1);

        // Encontra o primeiro slot livre para todas as colunas de startCol até endCol
        let slot = 0;
        while (true) {
          let conflict = false;
          for (let c = startCol; c <= endCol; c++) {
            if (colSlots[c][slot]) {
              conflict = true;
              break;
            }
          }
          if (!conflict) break;
          slot++;
        }

        // Marca como ocupado
        for (let c = startCol; c <= endCol; c++) {
          colSlots[c][slot] = true;
        }
        if (slot > maxSlot) maxSlot = slot;

        segments.push({
          event: ev,
          startCol,
          span,
          isStart: ev.date >= weekStartStr,
          isEnd: evEnd <= weekEndStr,
          rowSlot: slot,
        });
      }

      this.monthWeeks.push({
        days,
        segments,
        maxSlot,
      });

      if (cur.getMonth() !== this.month && w >= 4) break;
    }
  }

  onDragStart(ev: DragEvent, event: CalendarEvent): void {
    if (event.isSystem) {
      ev.preventDefault();
      return;
    }
    this.dragEventId = event.id;
    if (ev.dataTransfer) {
      ev.dataTransfer.setData('text/plain', event.id);
      ev.dataTransfer.effectAllowed = 'move';
    }
    (ev.target as HTMLElement).classList.add('dragging');
    document.body.classList.add('dragging-active');
  }

  onDragEnd(ev: DragEvent): void {
    (ev.target as HTMLElement).classList.remove('dragging');
    this.dragEventId = null;
    document.body.classList.remove('dragging-active');
    this.dragEnterCounters = new WeakMap();
  }

  private dragEnterCounters = new WeakMap<HTMLElement, number>();

  onDragEnter(ev: DragEvent, cell: HTMLElement): void {
    ev.preventDefault();
    const count = (this.dragEnterCounters.get(cell) ?? 0) + 1;
    this.dragEnterCounters.set(cell, count);
    if (count === 1) cell.classList.add('drag-over');
  }

  onDragOver(ev: DragEvent, cell: HTMLElement): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  }

  onDragLeave(ev: DragEvent, cell: HTMLElement): void {
    const count = Math.max(0, (this.dragEnterCounters.get(cell) ?? 0) - 1);
    this.dragEnterCounters.set(cell, count);
    if (count === 0) cell.classList.remove('drag-over');
  }

  onDrop(ev: DragEvent, day: MonthDay, cell: HTMLElement): void {
    ev.preventDefault();
    ev.stopPropagation();
    document.body.classList.remove('dragging-active');
    if (cell) {
      cell.classList.remove('drag-over');
      this.dragEnterCounters.set(cell, 0);
    }
    const eventId = (ev.dataTransfer ? ev.dataTransfer.getData('text/plain') : null) || this.dragEventId;
    if (eventId) {
      const orig = (this.events || []).find(e => e.id === eventId);
      this.eventDrop.emit({
        eventId,
        oldDate: orig?.date || day.dateStr,
        oldEndDate: orig?.endDate || orig?.date,
        newDate: day.dateStr,
      });
    }
  }

  toStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
