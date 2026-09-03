import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NotificationsService } from '../../core/services/notifications.service';
import { NotificationPreferences } from '../../core/models/notification.model';

@Component({
  selector: 'app-notification-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './notification-settings.component.html',
  styleUrl: './notification-settings.component.scss',
})
export class NotificationSettingsComponent implements OnInit {
  @Output() readonly closed = new EventEmitter<void>();
  readonly service = inject(NotificationsService);
  readonly copied = signal(false);
  readonly saved = signal(false);
  deviceName = 'Meu computador';
  activationCode = '';
  draft: NotificationPreferences = {
    enabled: true,
    taskEnabled: true,
    eventEnabled: true,
    taskTime: '08:30',
    eventMinutesBefore: 15,
  };

  get downloadUrl(): string {
    return new URL('downloads/Agenda.Notifier.exe', document.baseURI).toString();
  }

  ngOnInit(): void {
    this.service.load();
    const wait = window.setInterval(() => {
      if (this.service.loading()) return;
      window.clearInterval(wait);
      this.draft = { ...this.service.preferences() };
    }, 50);
    window.setTimeout(() => window.clearInterval(wait), 5000);
  }

  save(): void {
    this.service.save({ ...this.draft, eventMinutesBefore: Number(this.draft.eventMinutesBefore) }, success => {
      this.saved.set(success);
      if (success) window.setTimeout(() => this.saved.set(false), 2500);
    });
  }

  generateCode(): void {
    const name = this.deviceName.trim();
    if (!name) return;
    this.service.createDevice(name, result => {
      if (!result) return;
      const baseUrl = new URL('.', document.baseURI).toString();
      const serverUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      this.activationCode = btoa(JSON.stringify({ serverUrl, token: result.token }));
      this.copied.set(false);
    });
  }

  async copyCode(): Promise<void> {
    if (!this.activationCode) return;
    await navigator.clipboard.writeText(this.activationCode);
    this.copied.set(true);
    window.setTimeout(() => this.copied.set(false), 2500);
  }

  formatLastSeen(value: string | null): string {
    if (!value) return 'Ainda não conectado';
    return `Último acesso: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))}`;
  }
}
