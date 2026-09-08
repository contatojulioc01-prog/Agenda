import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NotificationsService } from '../../core/services/notifications.service';
import { AuthService } from '../../core/services/auth.service';

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
  private readonly auth = inject(AuthService);
  readonly copied = signal(false);
  deviceName = 'Meu computador';
  activationCode = '';

  get downloadUrl(): string {
    return new URL('downloads/Agenda.Notifier.exe?v=3', document.baseURI).toString();
  }

  ngOnInit(): void {
    this.service.load();
  }

  generateCode(): void {
    const name = this.deviceName.trim();
    if (!name) return;
    this.service.createDevice(name, result => {
      if (!result) return;
      const baseUrl = new URL('.', document.baseURI).toString();
      const serverUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      const encoded = btoa(JSON.stringify({
        serverUrl,
        userId: this.auth.currentUser()?.id || '',
        deviceKey: result.deviceKey,
      })).split('+').join('-').split('/').join('_').replace(/=+$/, '');
      this.activationCode = `AGENDA1-${encoded}`;
      this.copied.set(false);
    });
  }

  async copyCode(): Promise<void> {
    if (!this.activationCode) return;
    let success = false;
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(this.activationCode);
        success = true;
      }
    } catch {
      success = false;
    }
    if (!success) {
      const textarea = document.createElement('textarea');
      textarea.value = this.activationCode;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      try { success = document.execCommand('copy'); } catch { success = false; }
      textarea.remove();
    }
    if (!success) {
      this.service.error.set('O navegador bloqueou a cópia. Selecione o código e pressione Ctrl+C.');
      return;
    }
    this.service.error.set('');
    this.copied.set(true);
    window.setTimeout(() => this.copied.set(false), 2500);
  }

  formatLastSeen(value: string | null): string {
    if (!value) return 'Ainda não conectado';
    return `Último acesso: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))}`;
  }
}
