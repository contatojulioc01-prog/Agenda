import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, finalize, of } from 'rxjs';
import { NotificationDevice, NotificationPreferences, NotificationSettings } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  readonly preferences = signal<NotificationPreferences>({
    enabled: true,
    taskEnabled: true,
    eventEnabled: true,
    taskTime: '08:30',
    eventMinutesBefore: 15,
  });
  readonly devices = signal<NotificationDevice[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

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
