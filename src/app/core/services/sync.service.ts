import { Injectable, signal, inject, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CalendarsService } from './calendars.service';
import { EventsService } from './events.service';
import { InvitationsService } from './invitations.service';
import { KanbanService } from './kanban.service';

export type SyncStatus = 'connected' | 'connecting' | 'disconnected';

function getWsUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname) {
    // Usa a mesma porta/hostname do frontend (o proxy da porta 9990 irá encaminhar websockets para 9900)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const basePath = new URL(document.baseURI).pathname.replace(/\/$/, '');
    return `${protocol}//${window.location.host}${basePath}/ws`;
  }
  return 'ws://192.168.13.244:9900';
}

function getHttpUrl(): string {
  return '';
}

@Injectable({ providedIn: 'root' })
export class SyncService implements OnDestroy {
  private calendarsService = inject(CalendarsService);
  private eventsService = inject(EventsService);
  private invitationsService = inject(InvitationsService);
  private kanbanService = inject(KanbanService);
  private http = inject(HttpClient);
  private ngZone = inject(NgZone);

  status = signal<SyncStatus>('disconnected');
  lastSyncAt = signal<Date | null>(null);
  clientsOnline = signal<number>(0);

  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private healthOnline = false;

  constructor() {
    // Monitora a saúde do backend periodicamente e tenta reconectar caso desconectado
    this.healthInterval = setInterval(() => {
      this.checkHealthAndConnect();
    }, 4000);
  }

  /** Inicia a conexão WebSocket com o backend */
  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    if (!this.healthOnline) this.status.set('connecting');

    try {
      if (this.ws) {
        try { this.ws.close(); } catch {}
        this.ws = null;
      }

      const url = getWsUrl();
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.ngZone.run(() => {
          this.healthOnline = true;
          this.status.set('connected');
          this.lastSyncAt.set(new Date());
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
          console.log('[SyncService] WebSocket conectado com sucesso em', url);

          // Ao conectar, atualiza agendas e eventos
          this.calendarsService.loadAll();
          const ids = [...this.calendarsService.visibleCalendarIds()];
          if (ids.length) this.eventsService.loadFromCalendars(ids);
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.ngZone.run(() => this.handleMessage(msg));
        } catch {}
      };

      this.ws.onclose = () => {
        this.ngZone.run(() => {
          this.status.set(this.healthOnline ? 'connected' : 'disconnected');
          this.scheduleReconnect();
        });
      };

      this.ws.onerror = (err) => {
        this.ngZone.run(() => {
          this.status.set(this.healthOnline ? 'connected' : 'disconnected');
        });
      };
    } catch {
      this.status.set(this.healthOnline ? 'connected' : 'disconnected');
      this.scheduleReconnect();
    }
  }

  /** Verifica se a API HTTP está respondendo e força conexão */
  checkHealthAndConnect(): void {
    this.http.get<{ status: string; clients?: number }>(`${getHttpUrl()}/health`).subscribe({
      next: (res) => {
        if (res?.status === 'ok') {
          this.healthOnline = true;
          this.status.set('connected');
          this.lastSyncAt.set(new Date());
          this.clientsOnline.set(res.clients ?? 0);

          if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
            this.connect();
          }
        }
      },
      error: () => {
        this.healthOnline = false;
        this.status.set('disconnected');
      }
    });
  }

  disconnect(): void {
    this.healthOnline = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.healthInterval) clearInterval(this.healthInterval);
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.status.set('disconnected');
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private handleMessage(msg: { type: string; calendarId?: string; eventId?: string; userId?: string; boardId?: string; taskId?: string; teamId?: string }): void {
    this.lastSyncAt.set(new Date());

    switch (msg.type) {
      case 'event_created':
      case 'event_updated':
      case 'event_deleted':
        if (msg.calendarId && this.calendarsService.visibleCalendarIds().has(msg.calendarId)) {
          this.eventsService.loadFromCalendar(msg.calendarId);
        }
        break;

      case 'calendar_created':
      case 'calendar_updated':
      case 'calendar_deleted':
      case 'member_added':
      case 'member_updated':
      case 'member_removed':
        this.calendarsService.loadAll();
        break;
      case 'calendar_invited':
        this.invitationsService.load();
        break;
      case 'invitation_accepted':
      case 'invitation_declined':
        this.calendarsService.loadAll();
        this.invitationsService.load();
        break;
      case 'kanban_updated':
        if (this.kanbanService.shouldIgnoreRealtime()) break;
        if (msg.boardId && this.kanbanService.activeBoard()?.id === msg.boardId) {
          this.kanbanService.loadBoard(msg.boardId);
        } else {
          this.kanbanService.loadBoards();
        }
        break;
      case 'kanban_team_invited':
        this.kanbanService.loadTeamInvitations();
        break;
      case 'kanban_team_updated':
      case 'kanban_team_joined':
      case 'kanban_team_declined':
        this.kanbanService.loadTeams();
        this.kanbanService.loadTeamInvitations();
        this.kanbanService.loadBoards();
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 3000);
  }
}
