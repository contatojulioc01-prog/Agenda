import { Component, Input, Output, EventEmitter, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Holiday } from '../../../core/models/holiday.model';
import { CalendarEvent } from '../../../core/models/event.model';

interface MiniDay {
  date: Date;
  dateStr: string;
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  hasEvent: boolean;
  isSelected: boolean;
}

@Component({
  selector: 'app-mini-calendar',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  templateUrl: './mini-calendar.component.html',
  styleUrl: './mini-calendar.component.scss'
})
export class MiniCalendarComponent implements OnInit, OnChanges {
  @Input() selectedDate: Date = new Date();
  @Input() holidays: Holiday[] = [];
  @Input() events: CalendarEvent[] = [];
  @Output() dateSelected = new EventEmitter<Date>();
  @Output() monthChanged = new EventEmitter<Date>();

  viewDate: Date = new Date();
  weeks: MiniDay[][] = [];
  monthLabel = '';
  readonly DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  ngOnInit(): void {
    this.viewDate = new Date(this.selectedDate || new Date());
    this.build();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedDate'] && this.selectedDate) {
      this.viewDate = new Date(this.selectedDate);
    }
    this.build();
  }

  prevMonth(): void {
    this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() - 1, 1);
    this.monthChanged.emit(new Date(this.viewDate));
    this.build();
  }

  nextMonth(): void {
    this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + 1, 1);
    this.monthChanged.emit(new Date(this.viewDate));
    this.build();
  }

  selectDay(day: MiniDay): void {
    this.dateSelected.emit(day.date);
  }

  private build(): void {
    const today = new Date();
    const currentDate = this.viewDate || new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    this.monthLabel = `${months[month]} ${year}`;

    const first = new Date(year, month, 1);
    const startDow = first.getDay();
    const start = new Date(year, month, 1 - startDow);

    const holidayDates = new Set((this.holidays || []).map(h => h.date));
    const eventDates = new Set((this.events || []).map(e => e.date));
    const selectedStr = this.toStr(this.selectedDate || new Date());
    const todayStr = this.toStr(today);

    this.weeks = [];
    let cur = new Date(start);
    for (let w = 0; w < 6; w++) {
      const week: MiniDay[] = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = this.toStr(cur);
        week.push({
          date: new Date(cur),
          dateStr,
          dayNum: cur.getDate(),
          isCurrentMonth: cur.getMonth() === month,
          isToday: todayStr === dateStr,
          isWeekend: cur.getDay() === 0 || cur.getDay() === 6,
          isHoliday: holidayDates.has(dateStr),
          hasEvent: eventDates.has(dateStr),
          isSelected: selectedStr === dateStr,
        });
        cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
      }
      this.weeks.push(week);
      if (cur.getMonth() !== month && w >= 4) break;
    }
  }

  private toStr(d: Date): string {
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
