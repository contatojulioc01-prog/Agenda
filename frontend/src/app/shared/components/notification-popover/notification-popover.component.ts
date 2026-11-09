import { Component, EventEmitter, HostListener, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NotificationsService } from '../../../core/services/notifications.service';
import { InAppNotification } from '../../../core/models/notification.model';

@Component({
  selector: 'app-notification-popover',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="sidebar-notification-card" (click)="$event.stopPropagation()">
      <div class="card-header">
        <div class="header-left">
          <mat-icon class="bell-icon">notifications</mat-icon>
          <span class="card-title">Notificações</span>
          <span class="unread-pill" *ngIf="notificationsService.unreadCount() > 0">
            {{ notificationsService.unreadCount() }}
          </span>
        </div>
        <div class="header-right">
          <button
            type="button"
            class="action-btn"
            *ngIf="notificationsService.unreadCount() > 0"
            (click)="markAllAsRead()"
            matTooltip="Marcar todas como lidas"
            aria-label="Marcar todas como lidas"
          >
            <mat-icon>done_all</mat-icon>
          </button>
          <button
            type="button"
            class="action-btn close-btn"
            (click)="close.emit()"
            matTooltip="Fechar"
            aria-label="Fechar"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>

      <div class="card-body">
        <div class="notifications-list" *ngIf="notificationsService.inAppNotifications().length > 0; else emptyState">
          <div
            *ngFor="let notif of notificationsService.inAppNotifications()"
            class="notif-item"
            [class.unread]="!notif.read"
            (click)="onNotificationClick(notif)"
          >
            <div class="notif-badge" [ngClass]="notif.type">
              <mat-icon>{{ getNotificationIcon(notif.type) }}</mat-icon>
            </div>
            <div class="notif-content">
              <div class="notif-row">
                <span class="notif-title">{{ notif.title }}</span>
                <span class="notif-time">{{ formatTime(notif.createdAt) }}</span>
              </div>
              <p class="notif-message">{{ notif.message }}</p>
            </div>
          </div>
        </div>

        <ng-template #emptyState>
          <div class="empty-state">
            <mat-icon class="empty-icon">notifications_none</mat-icon>
            <p>Nenhuma notificação por enquanto.</p>
          </div>
        </ng-template>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      position: absolute;
      bottom: 96px;
      left: 8px;
      right: 8px;
      z-index: 50;
      animation: popoverSlideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes popoverSlideUp {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .sidebar-notification-card {
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 12px;
      box-shadow: 0 12px 28px -4px rgba(0, 0, 0, 0.18), 0 4px 10px -2px rgba(0, 0, 0, 0.08);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      max-height: 380px;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: var(--bg-hover, #f8fafc);
      border-bottom: 1px solid var(--border, #e2e8f0);
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .bell-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--brand-500, #4f46e5);
      flex-shrink: 0;
    }

    .card-title {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text-primary, #0f172a);
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .unread-pill {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      font-size: 0.68rem;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 10px;
      flex-shrink: 0;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .action-btn {
      background: transparent;
      border: none;
      color: var(--text-muted, #94a3b8);
      cursor: pointer;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: all 0.15s ease;
    }

    .action-btn:hover {
      background: var(--bg-hover, #e2e8f0);
      color: var(--text-primary, #0f172a);
    }

    .action-btn.close-btn:hover {
      background: #fee2e2;
      color: #ef4444;
    }

    .action-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .card-body {
      flex: 1;
      overflow-y: auto;
      max-height: 310px;
      overscroll-behavior: contain;
    }

    .card-body::-webkit-scrollbar {
      width: 4px;
    }

    .card-body::-webkit-scrollbar-thumb {
      background: var(--border, #cbd5e1);
      border-radius: 4px;
    }

    .notifications-list {
      display: flex;
      flex-direction: column;
    }

    .notif-item {
      display: flex;
      gap: 8px;
      padding: 9px 12px;
      border-bottom: 1px solid var(--border-light, #f1f5f9);
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .notif-item:hover {
      background: var(--bg-hover, #f8fafc);
    }

    .notif-item.unread {
      background: #f0f7ff;
      border-left: 3px solid var(--brand-500, #4f46e5);
    }

    .notif-badge {
      width: 28px;
      height: 28px;
      border-radius: 7px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: #ffffff;
      background: #64748b;
    }

    .notif-badge.mention { background: #8b5cf6; }
    .notif-badge.rsvp { background: #10b981; }
    .notif-badge.event_invite { background: #0284c7; }
    .notif-badge.task_assigned { background: #f59e0b; }

    .notif-badge mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }

    .notif-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .notif-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 6px;
    }

    .notif-title {
      font-size: 0.76rem;
      font-weight: 700;
      color: var(--text-primary, #0f172a);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .notif-time {
      font-size: 0.65rem;
      color: var(--text-muted, #94a3b8);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .notif-message {
      font-size: 0.72rem;
      color: var(--text-secondary, #475569);
      margin: 0;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 30px 14px;
      color: var(--text-muted, #94a3b8);
      text-align: center;
      gap: 6px;
    }

    .empty-icon {
      font-size: 30px;
      width: 30px;
      height: 30px;
      opacity: 0.6;
    }

    .empty-state p {
      font-size: 0.75rem;
      margin: 0;
    }
  `]
})
export class NotificationPopoverComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() navigateAction = new EventEmitter<InAppNotification>();

  readonly notificationsService = inject(NotificationsService);

  @HostListener('document:keydown.escape')
  onEscapePress(): void {
    this.close.emit();
  }

  ngOnInit(): void {
    this.notificationsService.loadInApp();
  }

  markAllAsRead(): void {
    this.notificationsService.markAllAsRead();
  }

  onNotificationClick(notif: InAppNotification): void {
    if (!notif.read) {
      this.notificationsService.markAsRead(notif.id);
    }
    this.navigateAction.emit(notif);
  }

  getNotificationIcon(type: string): string {
    switch (type) {
      case 'mention': return 'alternate_email';
      case 'rsvp': return 'event_available';
      case 'event_invite': return 'mail';
      case 'task_assigned': return 'assignment_ind';
      default: return 'notifications';
    }
  }

  formatTime(isoString: string): string {
    if (!isoString) return '';
    try {
      const dt = new Date(isoString);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    } catch {
      return '';
    }
  }
}



