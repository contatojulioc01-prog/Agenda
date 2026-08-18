import { Injectable, signal, inject, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CalendarsService } from './calendars.service';
import { EventsService } from './events.service';

export type SyncStatus = 'connected' | 'connecting' | 'disconnected';

function getWsUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}:9900`;
  }
  return 'ws://192.168.13.244:9900';
}

function getHttpUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname) {
    return `http://${window.location.hostname}:9900`;
  }
  return 'http://192.168.13.244:9900';
}

@Injectable({ providedIn: 'root' })
export class SyncService implements OnDestroy {
  private calendarsService = inject(CalendarsService);
  private eventsService = inject(EventsService);
  private http = inject(HttpClient);
  private ngZone = inject(NgZone);

  status = signal<SyncStatus>('disconnected');
  lastSyncAt = signal<Date | null>(null);
  clientsOnline = signal<number>(0);

  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private healthInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Monitora a saúde do backend periodicamente e tenta reconectar caso desconectado
    this.healthInterval = setInterval(() => {
      if (this.status() !== 'connected') {
        this.checkHealthAndConnect();
      }
    }, 4000);
  }

  /** Inicia a conexão WebSocket com o backend */
  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.status.set('connecting');

    try {
      if (this.ws) {
        try { this.ws.close(); } catch {}
        this.ws = null;
      }

      const url = getWsUrl();
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.ngZone.run(() => {
          this.status.set('connected');
          this.lastSyncAt.set(new Date());
          console.log('[SyncService] WebSocket conectado com sucesso em', url);

          // Ao conectar, atualiza agendas e eventos
          this.calendarsService.loadAll();
          const ids = this.calendarsService.calendars().map(c => c.id);
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
          this.status.set('disconnected');
          this.scheduleReconnect();
        });
      };

      this.ws.onerror = (err) => {
        this.ngZone.run(() => {
          this.status.set('disconnected');
        });
      };
    } catch {
      this.status.set('disconnected');
      this.scheduleReconnect();
    }
  }

  /** Verifica se a API HTTP está respondendo e força conexão */
  checkHealthAndConnect(): void {
    this.http.get<{ status: string }>(`${getHttpUrl()}/health`).subscribe({
      next: (res) => {
        if (res?.status === 'ok' && this.status() !== 'connected') {
          this.connect();
        }
      },
      error: () => {
        this.status.set('disconnected');
      }
    });
  }

  disconnect(): void {
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

  private handleMessage(msg: { type: string; calendarId?: string; eventId?: string }): void {
    this.lastSyncAt.set(new Date());

    switch (msg.type) {
      case 'event_created':
      case 'event_updated':
      case 'event_deleted':
        if (msg.calendarId) {
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
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 3000);
  }
}
