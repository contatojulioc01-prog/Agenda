import {
  Component, Input, Output, EventEmitter, OnChanges, OnInit, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CalendarEvent, EVENT_COLOR_MAP } from '../../../../core/models/event.model';
import { Holiday } from '../../../../core/models/holiday.model';

interface MonthDay {
  date: Date;
  dateStr: string;
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  holiday: Holiday | null;
  events: CalendarEvent[];
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
  @Output() eventClick = new EventEmitter<CalendarEvent>();
  @Output() eventDrop = new EventEmitter<{ eventId: string; newDate: string }>();

  readonly DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  readonly colorMap = EVENT_COLOR_MAP;

  weeks: MonthDay[][] = [];
  dragEventId: string | null = null;

  ngOnInit(): void {
    this.build();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.build();
  }

  private build(): void {
    const today = this.toStr(new Date());
    const holidayMap = new Map((this.holidays || []).map(h => [h.date, h]));
    const eventMap = new Map<string, CalendarEvent[]>();
    for (const ev of (this.events || [])) {
      if (!eventMap.has(ev.date)) eventMap.set(ev.date, []);
      eventMap.get(ev.date)!.push(ev);
    }
    // Sort events by time
    eventMap.forEach(evs => evs.sort((a, b) => a.startTime.localeCompare(b.startTime)));

    const first = new Date(this.year, this.month, 1);
    const startDow = first.getDay();
    const start = new Date(this.year, this.month, 1 - startDow);

    this.weeks = [];
    let cur = new Date(start);
    for (let w = 0; w < 6; w++) {
      const week: MonthDay[] = [];
      for (let d = 0; d < 7; d++) {
        const ds = this.toStr(cur);
        week.push({
          date: new Date(cur),
          dateStr: ds,
          dayNum: cur.getDate(),
          isCurrentMonth: cur.getMonth() === this.month,
          isToday: ds === today,
          isWeekend: cur.getDay() === 0 || cur.getDay() === 6,
          holiday: holidayMap.get(ds) ?? null,
          events: eventMap.get(ds) ?? [],
        });
        cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
      }
      this.weeks.push(week);
      if (cur.getMonth() !== this.month && w >= 4) break;
    }
  }

  onDragStart(ev: DragEvent, event: CalendarEvent): void {
    this.dragEventId = event.id;
    if (ev.dataTransfer) {
      ev.dataTransfer.setData('text/plain', event.id);
      ev.dataTransfer.effectAllowed = 'move';
    }
    (ev.target as HTMLElement).classList.add('dragging');
  }

  onDragEnd(ev: DragEvent): void {
    (ev.target as HTMLElement).classList.remove('dragging');
    this.dragEventId = null;
  }

  onDragOver(ev: DragEvent, cell: HTMLElement): void {
    ev.preventDefault();
    if (ev.dataTransfer) {
      ev.dataTransfer.dropEffect = 'move';
    }
    cell.classList.add('drag-over');
  }

  onDragLeave(cell: HTMLElement): void {
    cell.classList.remove('drag-over');
  }

  onDrop(ev: DragEvent, day: MonthDay, cell: HTMLElement): void {
    ev.preventDefault();
    cell.classList.remove('drag-over');
    const eventId = ev.dataTransfer ? ev.dataTransfer.getData('text/plain') : null;
    if (eventId) {
      this.eventDrop.emit({ eventId, newDate: day.dateStr });
    }
  }

  toStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
