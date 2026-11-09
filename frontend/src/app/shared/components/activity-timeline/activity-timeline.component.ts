import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivityComment, ActivityLog } from '../../../core/models/kanban.model';
import { KanbanService } from '../../../core/services/kanban.service';
import { MuralService } from '../../../core/services/mural.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-activity-timeline',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="activity-timeline">
      <div class="tabs">
        <button type="button" class="tab-btn" [class.active]="activeTab === 'comments'" (click)="activeTab = 'comments'">
          <span class="tab-icon">💬</span> Comentários ({{ comments().length }})
        </button>
        <button type="button" class="tab-btn" [class.active]="activeTab === 'history'" (click)="activeTab = 'history'">
          <span class="tab-icon">📋</span> Histórico ({{ logs().length }})
        </button>
      </div>

      <!-- Aba de Comentários -->
      <div class="tab-content" *ngIf="activeTab === 'comments'">
        <div class="comment-input-box">
          <textarea
            class="comment-textarea"
            [(ngModel)]="newCommentText"
            placeholder="Escreva um comentário ou use @nome para mencionar alguém..."
            rows="2"
            (keydown)="onKeydown($event)"
          ></textarea>
          <div class="comment-actions">
            <span class="tip-hint">Dica: Ctrl + Enter para enviar</span>
            <button
              type="button"
              class="btn-send-comment"
              [disabled]="!newCommentText.trim() || sending()"
              (click)="submitComment()"
            >
              {{ sending() ? 'Enviando...' : 'Comentar' }}
            </button>
          </div>
        </div>

        <div class="comments-list" *ngIf="comments().length > 0; else noComments">
          <div class="comment-item" *ngFor="let c of comments()">
            <div class="avatar-badge">
              <span *ngIf="!c.userAvatar">{{ c.userName.slice(0, 2).toUpperCase() }}</span>
              <img *ngIf="c.userAvatar" [src]="c.userAvatar" [alt]="c.userName" />
            </div>
            <div class="comment-body">
              <div class="comment-header">
                <span class="user-name">{{ c.userName }}</span>
                <span class="comment-time">{{ formatTime(c.createdAt) }}</span>
              </div>
              <div class="comment-text" [innerHTML]="formatMentions(c.content)"></div>
            </div>
          </div>
        </div>
        <ng-template #noComments>
          <p class="empty-text">Nenhum comentário ainda. Deixe a primeira observação!</p>
        </ng-template>
      </div>

      <!-- Aba de Histórico de Auditoria -->
      <div class="tab-content" *ngIf="activeTab === 'history'">
        <div class="history-list" *ngIf="logs().length > 0; else noLogs">
          <div class="history-item" *ngFor="let l of logs()">
            <div class="history-dot"></div>
            <div class="history-content">
              <span class="history-user">{{ l.userName }}</span>
              <span class="history-action">{{ l.action }}</span>
              <span class="history-time">{{ formatTime(l.createdAt) }}</span>
            </div>
          </div>
        </div>
        <ng-template #noLogs>
          <p class="empty-text">Nenhum registro de alteração ainda.</p>
        </ng-template>
      </div>
    </div>
  `,
  styles: [`
    .activity-timeline {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--border-subtle, #e2e8f0);
    }
    .tabs {
      display: flex;
      gap: 8px;
    }
    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-secondary, #64748b);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .tab-btn:hover {
      background: var(--bg-hover, #f1f5f9);
      color: var(--text-primary, #0f172a);
    }
    .tab-btn.active {
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #1d4ed8;
    }
    .comment-input-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--bg-card, #ffffff);
      border: 1px solid var(--border-subtle, #e2e8f0);
      border-radius: 8px;
      padding: 8px 10px;
    }
    .comment-textarea {
      border: none;
      outline: none;
      resize: vertical;
      font-family: inherit;
      font-size: 0.88rem;
      color: var(--text-primary, #0f172a);
      background: transparent;
      min-height: 48px;
    }
    .comment-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .tip-hint {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .btn-send-comment {
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn-send-comment:hover:not(:disabled) {
      background: #1d4ed8;
    }
    .btn-send-comment:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .comments-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 6px;
    }
    .comment-item {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 8px 10px;
      background: var(--bg-item, #f8fafc);
      border-radius: 8px;
      border: 1px solid var(--border-subtle, #f1f5f9);
    }
    .avatar-badge {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: #e2e8f0;
      color: #334155;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.72rem;
      font-weight: 700;
      flex-shrink: 0;
      overflow: hidden;
    }
    .avatar-badge img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .comment-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .comment-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .user-name {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text-primary, #0f172a);
    }
    .comment-time {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .comment-text {
      font-size: 0.84rem;
      color: var(--text-secondary, #334155);
      line-height: 1.4;
      white-space: pre-wrap;
    }
    .comment-text :global(.mention-tag) {
      color: #2563eb;
      font-weight: 600;
      background: #dbeafe;
      padding: 1px 4px;
      border-radius: 4px;
    }
    .history-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: relative;
      padding-left: 14px;
      border-left: 2px solid #e2e8f0;
    }
    .history-item {
      display: flex;
      align-items: center;
      gap: 8px;
      position: relative;
      font-size: 0.8rem;
    }
    .history-dot {
      position: absolute;
      left: -19px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #94a3b8;
      border: 2px solid #ffffff;
    }
    .history-content {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }
    .history-user {
      font-weight: 600;
      color: var(--text-primary, #0f172a);
    }
    .history-action {
      color: var(--text-secondary, #475569);
    }
    .history-time {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .empty-text {
      font-size: 0.82rem;
      color: #94a3b8;
      font-style: italic;
      text-align: center;
      padding: 12px 0;
    }
  `]
})
export class ActivityTimelineComponent implements OnInit {
  @Input({ required: true }) entityType!: 'task' | 'mural_item';
  @Input({ required: true }) entityId!: string;

  private kanbanService = inject(KanbanService);
  private muralService = inject(MuralService);
  private auth = inject(AuthService);

  activeTab: 'comments' | 'history' = 'comments';
  comments = signal<ActivityComment[]>([]);
  logs = signal<ActivityLog[]>([]);
  newCommentText = '';
  sending = signal(false);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    if (this.entityType === 'task') {
      this.kanbanService.loadTimeline(this.entityId).subscribe(res => {
        if (res) {
          this.comments.set(res.comments || []);
          this.logs.set(res.logs || []);
        }
      });
    } else {
      this.muralService.loadTimeline(this.entityId).subscribe(res => {
        if (res) {
          this.comments.set(res.comments || []);
          this.logs.set(res.logs || []);
        }
      });
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.submitComment();
    }
  }

  submitComment(): void {
    const text = this.newCommentText.trim();
    if (!text || this.sending()) return;
    this.sending.set(true);

    const currentUser = this.auth.currentUser();
    const userName = currentUser?.name || 'Usuário';
    const userAvatar = currentUser?.avatar || '';

    const obs$ = this.entityType === 'task'
      ? this.kanbanService.addComment(this.entityId, text, userName, userAvatar)
      : this.muralService.addComment(this.entityId, text, userName, userAvatar);

    obs$.subscribe({
      next: (comm) => {
        this.comments.update(list => [...list, comm]);
        this.newCommentText = '';
        this.sending.set(false);
      },
      error: () => this.sending.set(false)
    });
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

  formatMentions(content: string): string {
    if (!content) return '';
    // Escapar html básico
    const safe = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return safe.replace(/@(\w+)/g, '<span class="mention-tag">@$1</span>');
  }
}
