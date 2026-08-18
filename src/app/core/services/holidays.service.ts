import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, catchError } from 'rxjs';
import { Holiday } from '../models/holiday.model';

function getBackendUrl(): string {
  return '';
}

@Injectable({ providedIn: 'root' })
export class HolidaysService {
  private cache = new Map<number, Holiday[]>();

  constructor(private http: HttpClient) {}

  getHolidays(year: number): Observable<Holiday[]> {
    if (this.cache.has(year)) {
      return of(this.cache.get(year)!);
    }
    return this.http.get<Holiday[]>(`${getBackendUrl()}/api/holidays/${year}`).pipe(
      tap(data => this.cache.set(year, data)),
      catchError(() => of([]))
    );
  }

  isHoliday(date: string, holidays: Holiday[]): Holiday | undefined {
    return holidays.find(h => h.date === date);
  }
}
