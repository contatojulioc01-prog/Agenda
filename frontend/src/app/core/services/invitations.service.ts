import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { AuthService } from './auth.service';

export interface CalendarInvitation {
  id: string;
  calendar_id: string;
  permission: 'editor' | 'viewer';
  calendar_name: string;
  calendar_color: string;
  owner_id: string;
}

@Injectable({ providedIn: 'root' })
export class InvitationsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  invitations = signal<CalendarInvitation[]>([]);

  private get headers() { return { 'x-user-id': this.auth.currentUser()?.id ?? '' }; }

  load(): void {
    if (!this.auth.currentUser()?.id) return;
    this.http.get<CalendarInvitation[]>('/api/calendars/invitations', { headers: this.headers })
      .pipe(catchError(() => of([])))
      .subscribe(items => this.invitations.set(items));
  }

  respond(invitation: CalendarInvitation, accept: boolean, done: () => void): void {
    this.http.put(`/api/calendars/invitations/${invitation.id}`, { accept }, { headers: this.headers })
      .pipe(catchError(() => of(null)))
      .subscribe(result => {
        if (result) this.invitations.update(items => items.filter(i => i.id !== invitation.id));
        done();
      });
  }
}
