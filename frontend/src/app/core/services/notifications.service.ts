import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, finalize, of } from 'rxjs';
import { InAppNotification, NotificationDevice, NotificationPreferences, NotificationSettings } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  readonly preferences = signal<NotificationPreferences>({
    enabled: true,
    taskEnabled: true,
    eventEnabled: true,
    taskTime: '08:30',
    taskDaysBefore: 1,
    eventMinutesBefore: 15,
  });
  readonly devices = signal<NotificationDevice[]>([]);
  readonly inAppNotifications = signal<InAppNotification[]>([]);
  readonly unreadCount = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  loadInApp(): void {
    this.http.get<{ notifications: InAppNotification[]; unreadCount: number }>('/api/notifications/inbox')
      .pipe(catchError(() => of(null)))
      .subscribe(res => {
        if (!res) return;
        this.inAppNotifications.set(res.notifications || []);
        this.unreadCount.set(res.unreadCount || 0);
      });
  }

  markAsRead(id: string): void {
    this.http.patch(`/api/notifications/${id}/read`, {})
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        this.inAppNotifications.update(list => list.map(n => n.id === id ? { ...n, read: true } : n));
        this.unreadCount.update(c => Math.max(0, c - 1));
      });
  }

  markAllAsRead(): void {
    this.http.post('/api/notifications/read-all', {})
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        this.inAppNotifications.update(list => list.map(n => ({ ...n, read: true })));
        this.unreadCount.set(0);
      });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<NotificationSettings>('/api/notifications')
      .pipe(
        catchError(error => {
          this.error.set(error.error?.error || 'Não foi possível carregar as notificações.');
          return of(null);
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe(result => {
        if (!result) return;
        this.preferences.set(result.preferences);
        this.devices.set(result.devices);
      });
  }

  save(preferences: NotificationPreferences, complete?: (success: boolean) => void): void {
    this.saving.set(true);
    this.error.set('');
    this.http.put<NotificationPreferences>('/api/notifications/preferences', preferences)
      .pipe(
        catchError(error => {
          this.error.set(error.error?.error || 'Não foi possível salvar as preferências.');
          return of(null);
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe(result => {
        if (result) this.preferences.set(result);
        complete?.(!!result);
      });
  }

  createDevice(name: string, complete: (result: { device: NotificationDevice; deviceKey: string } | null) => void): void {
    this.saving.set(true);
    this.error.set('');
    this.http.post<{ device: NotificationDevice; deviceKey: string }>('/api/notifications/devices', { name })
      .pipe(
        catchError(error => {
          this.error.set(error.error?.error || 'Não foi possível gerar o código de ativação.');
          return of(null);
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe(result => {
        if (result) this.devices.update(devices => [result.device, ...devices]);
        complete(result);
      });
  }

  revokeDevice(id: string): void {
    this.error.set('');
    this.http.delete<{ success: boolean }>(`/api/notifications/devices/${encodeURIComponent(id)}`)
      .pipe(catchError(error => {
        this.error.set(error.error?.error || 'Não foi possível revogar o computador.');
        return of(null);
      }))
      .subscribe(result => {
        if (result) this.devices.update(devices => devices.filter(device => device.id !== id));
      });
  }
}
