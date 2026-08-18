import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { Holiday } from '../models/holiday.model';

@Injectable({ providedIn: 'root' })
export class HolidaysService {
  private readonly API = 'https://brasilapi.com.br/api/feriados/v1';
  private cache = new Map<number, Holiday[]>();

  constructor(private http: HttpClient) {}

  getHolidays(year: number): Observable<Holiday[]> {
    if (this.cache.has(year)) {
      return of(this.cache.get(year)!);
    }
    return this.http.get<Holiday[]>(`${this.API}/${year}`).pipe(
      tap(data => this.cache.set(year, data))
    );
  }

  isHoliday(date: string, holidays: Holiday[]): Holiday | undefined {
    return holidays.find(h => h.date === date);
  }
}
