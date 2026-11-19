import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { SyncService } from '../../../core/services/sync.service';
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component';
import { AdminPageService } from './admin-page.service';
import {
  AdminAuditLog,
  AdminBannerLevel,
  AdminMigration,
  AdminNotificationDelivery,
  AdminNotificationDevice,
  AdminOverview,
  AdminPendingInvitations,
  AdminServerLog,
  AdminStorageSummary,
  AdminTrashTask,
  AuthCacheEntry,
  IntegrationsHealthResponse,
  UserDiagnostics,
} from '../../../core/models/admin.model';

export type AdminTab = 'health' | 'sso' | 'notifier' | 'storage' | 'support' | 'audit';

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  onConfirm: () => void;
}

const AUDIT_LABELS: Record<string, string> = {
  REALTIME_BROADCAST: 'Broadcast Realtime',
  SET_MAINTENANCE_BANNER: 'Banner de Manutenção',
  CLEAR_AUTH_CACHE: 'Limpeza de Cache SSO',
  ENABLE_DEVICE: 'Dispositivo Reativado',
  REVOKE_DEVICE: 'Dispositivo Revogado',
  SEND_TEST_NOTIFICATION: 'Notificação de Teste',
  PURGE_ORPHAN_ATTACHMENTS: 'Limpeza de Órfãos',
  RESTORE_TRASH_TASK: 'Restauração da Lixeira',
  PURGE_TRASH_TASK: 'Expurgo Definitivo',
  TRANSFER_OWNERSHIP: 'Transferência de Dono',
  CANCEL_INVITATION: 'Convite Cancelado',
  EXPORT_LGPD_SUMMARY: 'Relatório LGPD',
};

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    ThemeToggleComponent,
  ],
  templateUrl: './admin-page.component.html',
  styleUrls: ['./admin-page.component.scss'],
})
export class AdminPageComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  private readonly syncService = inject(SyncService);
  private readonly adminService = inject(AdminPageService);
  private readonly router = inject(Router);
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private livePollTimer: ReturnType<typeof setInterval> | null = null;
  private realtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeSync: (() => void) | null = null;
  private silentInFlight = false;
  private healthTickCount = 0;
  private bannerFormInitialized = false;

  activeTab = signal<AdminTab>('health');
  busyAction = signal<string | null>(null);
  feedback = signal<{ type: 'success' | 'error'; text: string } | null>(null);
  confirmModal = signal<ConfirmDialogState | null>(null);
  copiedId = signal<string | null>(null);
  liveEnabled = signal<boolean>(true);
  isPageVisible = signal<boolean>(typeof document !== 'undefined' ? document.visibilityState === 'visible' : true);
  isLiveActive = computed(() => this.liveEnabled() && this.isPageVisible());
  lastUpdatedAt = signal<string>('');

  // 1. Saúde & Realtime
  overview = signal<AdminOverview | null>(null);
  integrationsHealth = signal<IntegrationsHealthResponse | null>(null);
  bannerEnabled = false;
  bannerMessage = '';
  bannerLevel: AdminBannerLevel = 'warning';
  broadcastTitle = 'Aviso do Sistema';
  broadcastMessage = '';
  broadcastLevel: AdminBannerLevel = 'info';

  // 2. SSO & Sessões
  authCacheEntries = signal<AuthCacheEntry[]>([]);
  diagnosticsUserId = '';
  diagnosticsResult = signal<UserDiagnostics | null>(null);

  // 3. Notifier
  devicesFilterUserId = '';
  devices = signal<AdminNotificationDevice[]>([]);
  deliveries = signal<AdminNotificationDelivery[]>([]);
  testNotifyUserId = '';
  testNotifyMessage = 'Notificação de teste enviada pelo Painel Admin (DEV).';

  // 4. Armazenamento & Lixeira
  storageSummary = signal<AdminStorageSummary | null>(null);
  orphanPreview = signal<{ count: number; totalBytes: number } | null>(null);
  trashQuery = '';
  trashTasks = signal<AdminTrashTask[]>([]);
  migrations = signal<AdminMigration[]>([]);

  // 5. Suporte
  transferResourceType = 'calendar';
  transferResourceId = '';
  transferNewOwnerId = '';
  pendingInvitations = signal<AdminPendingInvitations>({ calendarInvitations: [], teamInvitations: [] });

  // 6. Auditoria & Logs
  auditActionFilter = '';
  auditLogs = signal<AdminAuditLog[]>([]);
  serverLogLevel = 'all';
  serverLogs = signal<AdminServerLog[]>([]);

  allUsers = computed(() => this.authService.allUsers());
  currentUser = computed(() => this.authService.currentUser());
  pendingInvitesTotal = computed(() =>
    this.pendingInvitations().calendarInvitations.length + this.pendingInvitations().teamInvitations.length
  );
  activeDevicesCount = computed(() => this.devices().filter(d => d.enabled).length);
  memoryPercent = computed(() => {
    const ov = this.overview();
    if (!ov || !ov.memory.heapTotalMb) return 0;
    return Math.min(100, Math.round((ov.memory.heapUsedMb / ov.memory.heapTotalMb) * 100));
  });

  ngOnInit(): void {
    this.loadHealthTab();
    this.setupRealtimeUpdates();
  }

  ngOnDestroy(): void {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.stopLivePolling();
    if (this.realtimeDebounceTimer) clearTimeout(this.realtimeDebounceTimer);
    if (this.unsubscribeSync) {
      this.unsubscribeSync();
      this.unsubscribeSync = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.onWindowFocus);
    }
  }

  toggleLiveUpdates(): void {
    const next = !this.liveEnabled();
    this.liveEnabled.set(next);
    if (next && this.isPageVisible()) {
      this.refreshTabSilently(this.activeTab());
      this.startLivePolling();
    } else {
      this.stopLivePolling();
    }
  }

  private setupRealtimeUpdates(): void {
    if (typeof document !== 'undefined') {
      this.isPageVisible.set(document.visibilityState === 'visible');
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.onWindowFocus);
    }

    if (this.syncService.status() === 'disconnected') {
      this.syncService.connect();
    }
    this.unsubscribeSync = this.syncService.subscribe(event => {
      if (!this.isLiveActive() || !event) return;
      this.scheduleRealtimeRefresh(event);
    });

    if (this.isLiveActive()) {
      this.startLivePolling();
    }
  }

  private readonly onVisibilityChange = (): void => {
    const visible = typeof document !== 'undefined' && document.visibilityState === 'visible';
    this.isPageVisible.set(visible);
    if (visible && this.liveEnabled()) {
      this.refreshTabSilently(this.activeTab());
      this.startLivePolling();
    } else {
      this.stopLivePolling();
    }
  };

  private readonly onWindowFocus = (): void => {
    if (this.isLiveActive()) {
      this.refreshTabSilently(this.activeTab());
    }
  };

  private startLivePolling(): void {
    this.stopLivePolling();
    if (!this.isLiveActive()) return;
    this.livePollTimer = setInterval(() => {
      if (!this.isLiveActive() || this.silentInFlight || this.confirmModal()) return;
      this.refreshTabSilently(this.activeTab());
    }, 5000);
  }

  private stopLivePolling(): void {
    if (this.livePollTimer) {
      clearInterval(this.livePollTimer);
      this.livePollTimer = null;
    }
  }

  private scheduleRealtimeRefresh(event: any): void {
    if (event?.type === 'SYSTEM_BANNER_UPDATED' && event.banner) {
      this.bannerEnabled = Boolean(event.banner.enabled);
      this.bannerMessage = String(event.banner.message || '');
      this.bannerLevel = event.banner.level || 'warning';
    }
    if (this.realtimeDebounceTimer) clearTimeout(this.realtimeDebounceTimer);
    this.realtimeDebounceTimer = setTimeout(() => {
      if (!this.isLiveActive() || this.silentInFlight) return;
      this.refreshTabSilently(this.activeTab());
    }, 350);
  }

  private markUpdatedNow(): void {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    this.lastUpdatedAt.set(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
  }

  private refreshTabSilently(tab: AdminTab): void {
    if (!this.isLiveActive() || this.silentInFlight) return;
    this.silentInFlight = true;

    const done = () => {
      this.silentInFlight = false;
      this.markUpdatedNow();
    };

    switch (tab) {
      case 'health':
        this.healthTickCount += 1;
        this.adminService.getOverview().pipe(finalize(done)).subscribe({
          next: data => {
            this.overview.set(data);
            if (!this.bannerFormInitialized) {
              this.bannerEnabled = data.banner.enabled;
              this.bannerMessage = data.banner.message;
              this.bannerLevel = data.banner.level;
              this.bannerFormInitialized = true;
            }
          },
          error: () => {},
        });
        if (this.healthTickCount % 3 === 0) {
          this.adminService.getIntegrationsHealth().subscribe({
            next: health => this.integrationsHealth.set(health),
            error: () => {},
          });
        }
        break;
      case 'sso':
        this.adminService.getAuthCache().pipe(finalize(done)).subscribe({
          next: res => this.authCacheEntries.set(res.entries || []),
          error: () => {},
        });
        break;
      case 'notifier': {
        const uid = this.devicesFilterUserId.trim() || undefined;
        this.adminService.getNotificationDevices(uid).pipe(finalize(done)).subscribe({
          next: res => this.devices.set(res.devices || []),
          error: () => {},
        });
        this.adminService.getNotificationDeliveries(uid, 60).subscribe({
          next: res => this.deliveries.set(res.deliveries || []),
          error: () => {},
        });
        break;
      }
      case 'storage':
        this.adminService.getStorageSummary().pipe(finalize(done)).subscribe({
          next: res => this.storageSummary.set(res),
          error: () => {},
        });
        this.loadTrashTasks();
        break;
      case 'support':
        this.adminService.getPendingInvitations().pipe(finalize(done)).subscribe({
          next: res => this.pendingInvitations.set(res),
          error: () => {},
        });
        break;
      case 'audit':
        this.adminService.getAuditLogs(this.auditActionFilter, 80).pipe(finalize(done)).subscribe({
          next: res => this.auditLogs.set(res.logs || []),
          error: () => {},
        });
        this.loadServerLogs();
        break;
    }
  }

  goBackToAgenda(): void {
    void this.router.navigate(['/calendario']);
  }

  selectTab(tab: AdminTab): void {
    this.activeTab.set(tab);
    switch (tab) {
      case 'health':
        this.loadHealthTab();
        break;
      case 'sso':
        this.loadAuthCache();
        break;
      case 'notifier':
        this.loadNotifierTab();
        break;
      case 'storage':
        this.loadStorageTab();
        break;
      case 'support':
        this.loadPendingInvitations();
        break;
      case 'audit':
        this.loadAuditTab();
        break;
    }
  }

  refreshCurrentTab(): void {
    this.selectTab(this.activeTab());
  }

  isBusy(actionKey: string): boolean {
    return this.busyAction() === actionKey;
  }

  private showFeedback(type: 'success' | 'error', text: string): void {
    this.feedback.set({ type, text });
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => {
      this.feedback.set(null);
    }, 5500);
  }

  copyId(value: string): void {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    this.copiedId.set(value);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copiedId.set(null), 1800);
  }

  startTransferFromDiagnostics(resourceType: string, resourceId: string): void {
    this.transferResourceType = resourceType;
    this.transferResourceId = resourceId;
    this.selectTab('support');
    this.showFeedback('success', `Recurso ${resourceId} preenchido no formulário de transferência.`);
  }

  formatAuditAction(action: string): string {
    return AUDIT_LABELS[action] || action;
  }

  openConfirm(title: string, message: string, confirmLabel: string, danger: boolean, onConfirm: () => void): void {
    this.confirmModal.set({ title, message, confirmLabel, danger, onConfirm });
  }

  closeConfirm(): void {
    this.confirmModal.set(null);
  }

  executeConfirm(): void {
    const modal = this.confirmModal();
    if (!modal) return;
    this.confirmModal.set(null);
    modal.onConfirm();
  }

  resolveUserName(userId: string | null | undefined): string {
    if (!userId) return '—';
    const match = this.allUsers().find(u => u.id === userId);
    return match ? match.name : userId;
  }

  resolveUserEmail(userId: string | null | undefined): string {
    if (!userId) return '';
    const match = this.allUsers().find(u => u.id === userId);
    return match?.email || '';
  }

  formatBytes(bytes: number): string {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
    return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  formatUptime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds || 0));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m ${total % 60}s`;
  }

  // ── Aba 1: Saúde & Realtime ────────────────────────────────────────────────

  loadHealthTab(): void {
    this.busyAction.set('refresh-health');
    this.adminService.getOverview().pipe(
      finalize(() => this.busyAction.set(null))
    ).subscribe({
      next: data => {
        this.overview.set(data);
        this.bannerEnabled = data.banner.enabled;
        this.bannerMessage = data.banner.message;
        this.bannerLevel = data.banner.level;
        this.bannerFormInitialized = true;
        this.markUpdatedNow();
      },
      error: err => this.showFeedback('error', err?.error?.error || 'Falha ao carregar visão geral do servidor.'),
    });

    this.adminService.getIntegrationsHealth().subscribe({
      next: health => this.integrationsHealth.set(health),
      error: () => {},
    });
  }

  saveBanner(): void {
    if (this.bannerEnabled && !this.bannerMessage.trim()) {
      this.showFeedback('error', 'Informe uma mensagem antes de ativar o banner de manutenção.');
      return;
    }
    this.busyAction.set('save-banner');
    this.adminService.updateSystemBanner({
      enabled: this.bannerEnabled,
      message: this.bannerMessage.trim(),
      level: this.bannerLevel,
    }).pipe(finalize(() => this.busyAction.set(null))).subscribe({
      next: res => {
        this.showFeedback('success', res.banner.enabled ? 'Banner global ativado e propagado em tempo real.' : 'Banner global desativado.');
        this.loadHealthTab();
      },
      error: err => this.showFeedback('error', err?.error?.error || 'Erro ao salvar banner.'),
    });
  }

  sendBroadcast(): void {
    if (!this.broadcastMessage.trim()) {
      this.showFeedback('error', 'Digite a mensagem para enviar aos usuários online.');
      return;
    }
    this.openConfirm(
      'Enviar Aviso em Tempo Real',
      'Deseja transmitir esta mensagem agora para todos os usuários conectados via WebSocket/SSE?',
      'Enviar Broadcast',
      false,
      () => {
        this.busyAction.set('send-broadcast');
        this.adminService.sendRealtimeBroadcast({
          title: this.broadcastTitle.trim() || 'Aviso do Sistema',
          message: this.broadcastMessage.trim(),
          level: this.broadcastLevel,
        }).pipe(finalize(() => this.busyAction.set(null))).subscribe({
          next: () => {
            this.broadcastMessage = '';
            this.showFeedback('success', 'Broadcast enviado para todos os clientes online.');
          },
          error: err => this.showFeedback('error', err?.error?.error || 'Falha ao enviar broadcast.'),
        });
      }
    );
  }

  // ── Aba 2: SSO & Sessões ───────────────────────────────────────────────────

  loadAuthCache(): void {
    this.busyAction.set('load-cache');
    this.adminService.getAuthCache().pipe(finalize(() => this.busyAction.set(null))).subscribe({
      next: res => this.authCacheEntries.set(res.entries || []),
      error: err => this.showFeedback('error', err?.error?.error || 'Erro ao consultar cache SSO.'),
    });
  }

  confirmClearCache(userId?: string): void {
    const label = userId ? `do usuário ${this.resolveUserName(userId)}` : 'de TODOS os usuários';
    this.openConfirm(
      'Invalidar Cache de Sessões SSO',
      `Deseja limpar o cache de autenticação ${label}? As próximas requisições validarão novamente no SSO 192.168.13.244:7000.`,
      'Limpar Cache',
      true,
      () => {
        this.busyAction.set(userId ? `clear-cache-${userId}` : 'clear-cache-all');
        this.adminService.clearAuthCache(userId).pipe(finalize(() => this.busyAction.set(null))).subscribe({
          next: res => {
            this.showFeedback('success', `${res.removed} sessão(ões) removida(s) do cache.`);
            this.loadAuthCache();
          },
          error: err => this.showFeedback('error', err?.error?.error || 'Falha ao limpar cache SSO.'),
        });
      }
    );
  }

  runUserDiagnostics(): void {
    const uid = this.diagnosticsUserId.trim();
    if (!uid) {
      this.showFeedback('error', 'Selecione ou informe um colaborador para diagnosticar.');
      return;
    }
    this.busyAction.set('run-diagnostics');
    this.adminService.getUserDiagnostics(uid).pipe(finalize(() => this.busyAction.set(null))).subscribe({
      next: res => this.diagnosticsResult.set(res),
      error: err => this.showFeedback('error', err?.error?.error || 'Erro ao executar diagnóstico.'),
    });
  }

  // ── Aba 3: Notifier ────────────────────────────────────────────────────────

  loadNotifierTab(): void {
    this.busyAction.set('load-notifier');
    const uid = this.devicesFilterUserId.trim() || undefined;
    this.adminService.getNotificationDevices(uid).pipe(finalize(() => this.busyAction.set(null))).subscribe({
      next: res => this.devices.set(res.devices || []),
      error: err => this.showFeedback('error', err?.error?.error || 'Erro ao listar dispositivos.'),
    });
    this.adminService.getNotificationDeliveries(uid, 60).subscribe({
      next: res => this.deliveries.set(res.deliveries || []),
      error: () => {},
    });
  }

  confirmToggleDevice(device: AdminNotificationDevice): void {
    const actionLabel = device.enabled ? 'Revogar' : 'Reativar';
    this.openConfirm(
      `${actionLabel} Dispositivo Notifier`,
      `Deseja ${actionLabel.toLowerCase()} o dispositivo "${device.name}" (${this.resolveUserName(device.userId)})?`,
      actionLabel,
      device.enabled,
      () => {
        this.busyAction.set(`toggle-device-${device.id}`);
        this.adminService.toggleDevice(device.id, !device.enabled).pipe(finalize(() => this.busyAction.set(null))).subscribe({
          next: () => {
            this.showFeedback('success', `Dispositivo "${device.name}" atualizado.`);
            this.loadNotifierTab();
          },
          error: err => this.showFeedback('error', err?.error?.error || 'Erro ao atualizar dispositivo.'),
        });
      }
    );
  }

  sendTestNotification(): void {
    const uid = this.testNotifyUserId.trim();
    if (!uid) {
      this.showFeedback('error', 'Selecione um usuário para enviar a notificação de teste.');
      return;
    }
    this.busyAction.set('test-notify');
    this.adminService.sendTestNotification(uid, this.testNotifyMessage.trim()).pipe(finalize(() => this.busyAction.set(null))).subscribe({
      next: () => this.showFeedback('success', 'Notificação de teste disparada via realtime.'),
      error: err => this.showFeedback('error', err?.error?.error || 'Erro ao disparar notificação de teste.'),
    });
  }

  // ── Aba 4: Armazenamento & Lixeira ─────────────────────────────────────────

  loadStorageTab(): void {
    this.busyAction.set('load-storage');
    this.adminService.getStorageSummary().pipe(finalize(() => this.busyAction.set(null))).subscribe({
      next: res => this.storageSummary.set(res),
      error: err => this.showFeedback('error', err?.error?.error || 'Erro ao carregar resumo de armazenamento.'),
    });
    this.loadTrashTasks();
    this.adminService.getMigrations().subscribe({
      next: res => this.migrations.set(res.migrations || []),
      error: () => {},
    });
  }

  previewOrphanCleanup(): void {
    this.busyAction.set('preview-orphans');
    this.adminService.cleanupOrphanAttachments(true).pipe(finalize(() => this.busyAction.set(null))).subscribe({
      next: res => {
        this.orphanPreview.set({ count: res.count, totalBytes: res.totalBytes });
        this.showFeedback('success', `Pré-visualização concluída: ${res.count} anexo(s) órfão(s) (${this.formatBytes(res.totalBytes)}).`);
      },
      error: err => this.showFeedback('error', err?.error?.error || 'Falha ao simular limpeza de anexos.'),
    });
  }

  confirmOrphanCleanup(): void {
    this.openConfirm(
      'Remover Anexos Órfãos',
      'Esta ação removerá definitivamente do banco e do disco todos os anexos cujos eventos, tarefas ou cartões do mural não existem mais. Continuar?',
      'Remover Órfãos',
      true,
      () => {
        this.busyAction.set('purge-orphans');
        this.adminService.cleanupOrphanAttachments(false).pipe(finalize(() => this.busyAction.set(null))).subscribe({
          next: res => {
            this.orphanPreview.set(null);
            this.showFeedback('success', `${res.removedCount} anexo(s) órfão(s) removido(s) (${this.formatBytes(res.freedBytes)} liberados).`);
            this.loadStorageTab();
          },
          error: err => this.showFeedback('error', err?.error?.error || 'Falha ao remover anexos órfãos.'),
        });
      }
    );
  }

  loadTrashTasks(): void {
    this.adminService.getTrashTasks(this.trashQuery, 60).subscribe({
      next: res => this.trashTasks.set(res.tasks || []),
      error: () => {},
    });
  }

  restoreTask(task: AdminTrashTask): void {
    this.busyAction.set(`restore-task-${task.id}`);
    this.adminService.restoreTrashTask(task.id).pipe(finalize(() => this.busyAction.set(null))).subscribe({
      next: () => {
        this.showFeedback('success', `Tarefa "${task.title}" restaurada com sucesso.`);
        this.loadTrashTasks();
      },
      error: err => this.showFeedback('error', err?.error?.error || 'Falha ao restaurar tarefa.'),
    });
  }

  confirmPurgeTask(task: AdminTrashTask): void {
    this.openConfirm(
      'Expurgar Tarefa Definitivamente',
      `Deseja apagar permanentemente a tarefa "${task.title}" e suas subtarefas? Esta ação não pode ser desfeita.`,
      'Expurgar',
      true,
      () => {
        this.busyAction.set(`purge-task-${task.id}`);
        this.adminService.purgeTrashTask(task.id).pipe(finalize(() => this.busyAction.set(null))).subscribe({
          next: () => {
            this.showFeedback('success', `Tarefa "${task.title}" expurgada definitivamente.`);
            this.loadTrashTasks();
          },
          error: err => this.showFeedback('error', err?.error?.error || 'Falha ao expurgar tarefa.'),
        });
      }
    );
  }

  // ── Aba 5: Suporte Operacional ─────────────────────────────────────────────

  loadPendingInvitations(): void {
    this.busyAction.set('load-invitations');
    this.adminService.getPendingInvitations().pipe(finalize(() => this.busyAction.set(null))).subscribe({
      next: res => this.pendingInvitations.set(res),
      error: err => this.showFeedback('error', err?.error?.error || 'Erro ao carregar convites pendentes.'),
    });
  }

  confirmTransferOwnership(): void {
    if (!this.transferResourceId.trim() || !this.transferNewOwnerId.trim()) {
      this.showFeedback('error', 'Informe o ID do recurso e o novo proprietário.');
      return;
    }
    this.openConfirm(
      'Transferir Propriedade',
      `Deseja transferir a propriedade de ${this.transferResourceType} (${this.transferResourceId.trim()}) para ${this.resolveUserName(this.transferNewOwnerId.trim())}?`,
      'Transferir',
      true,
      () => {
        this.busyAction.set('transfer-ownership');
        this.adminService.transferOwnership({
          resourceType: this.transferResourceType,
          resourceId: this.transferResourceId.trim(),
          newOwnerId: this.transferNewOwnerId.trim(),
        }).pipe(finalize(() => this.busyAction.set(null))).subscribe({
          next: res => {
            this.transferResourceId = '';
            this.showFeedback('success', `Propriedade de "${res.resourceName}" transferida com sucesso.`);
          },
          error: err => this.showFeedback('error', err?.error?.error || 'Erro ao transferir propriedade.'),
        });
      }
    );
  }

  confirmCancelInvitation(type: 'calendar' | 'team', inviteId: string, label: string): void {
    this.openConfirm(
      'Cancelar Convite Pendente',
      `Deseja cancelar o convite pendente para "${label}"?`,
      'Cancelar Convite',
      true,
      () => {
        this.busyAction.set(`cancel-invite-${inviteId}`);
        this.adminService.cancelInvitation(type, inviteId).pipe(finalize(() => this.busyAction.set(null))).subscribe({
          next: () => {
            this.showFeedback('success', 'Convite cancelado com sucesso.');
            this.loadPendingInvitations();
          },
          error: err => this.showFeedback('error', err?.error?.error || 'Erro ao cancelar convite.'),
        });
      }
    );
  }

  // ── Aba 6: Auditoria, Logs & LGPD ──────────────────────────────────────────

  loadAuditTab(): void {
    this.busyAction.set('load-audit');
    this.adminService.getAuditLogs(this.auditActionFilter, 80).pipe(finalize(() => this.busyAction.set(null))).subscribe({
      next: res => this.auditLogs.set(res.logs || []),
      error: err => this.showFeedback('error', err?.error?.error || 'Erro ao carregar logs de auditoria.'),
    });
    this.loadServerLogs();
  }

  loadServerLogs(): void {
    this.adminService.getRecentServerLogs(this.serverLogLevel, 100).subscribe({
      next: res => this.serverLogs.set(res.entries || []),
      error: () => {},
    });
  }

  downloadLgpdReport(): void {
    this.busyAction.set('download-lgpd');
    this.adminService.getLgpdReport().pipe(finalize(() => this.busyAction.set(null))).subscribe({
      next: report => {
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const now = new Date();
        const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        link.download = `relatorio-lgpd-agenda-${stamp}.json`;
        link.click();
        URL.revokeObjectURL(url);
        this.showFeedback('success', 'Relatório LGPD gerado e baixado em UTF-8.');
        this.loadAuditTab();
      },
      error: err => this.showFeedback('error', err?.error?.error || 'Erro ao gerar relatório LGPD.'),
    });
  }
}
