import { Injectable, Signal, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export type AiTextAction = 'improve' | 'review' | 'explain' | 'reformat';
export type AiRole = 'user' | 'assistant';

export interface AiChatMessage {
  role: AiRole;
  content: string;
}

export interface AiConversationMessage extends AiChatMessage {
  id: number;
  timestamp: Date;
  error?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly auth = inject(AuthService);
  private readonly assistantOpenState = signal(false);
  private readonly availabilityState = signal(false);
  private readonly conversationMessagesState = signal<AiConversationMessage[]>([]);
  private sessionId: string | null = null;
  private messageSequence = 0;

  readonly isAssistantOpen: Signal<boolean> = this.assistantOpenState.asReadonly();
  readonly isAvailable: Signal<boolean> = this.availabilityState.asReadonly();
  readonly conversationMessages: Signal<AiConversationMessage[]> = this.conversationMessagesState.asReadonly();

  openAssistant(): void { this.assistantOpenState.set(true); }
  closeAssistant(): void { this.assistantOpenState.set(false); }

  addConversationMessage(role: AiRole, content: string): AiConversationMessage {
    const message: AiConversationMessage = { id: ++this.messageSequence, role, content, timestamp: new Date() };
    this.conversationMessagesState.update(messages => [...messages, message]);
    return message;
  }

  updateConversationMessage(id: number, update: (message: AiConversationMessage) => AiConversationMessage): void {
    this.conversationMessagesState.update(messages => messages.map(message => message.id === id ? update(message) : message));
  }

  newConversation(): void {
    this.conversationMessagesState.set([]);
    this.sessionId = this.createSessionId();
  }

  chat(messages: AiChatMessage[]): Observable<string> {
    return new Observable<string>(subscriber => {
      const controller = new AbortController();
      void this.consumeChatStream(messages, controller.signal, subscriber);
      return () => controller.abort();
    });
  }

  textAction(text: string, action: AiTextAction): Observable<string> {
    return new Observable<string>(subscriber => {
      const controller = new AbortController();
      void fetch('/api/ai/text-action', {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ text, action }),
        signal: controller.signal,
      }).then(async response => {
        const payload = await this.readJson(response);
        if (!response.ok) throw new Error(payload?.error || 'Não foi possível processar o texto.');
        this.availabilityState.set(true);
        subscriber.next(String(payload.result || ''));
        subscriber.complete();
      }).catch(error => {
        if (error?.name !== 'AbortError') {
          this.availabilityState.set(false);
          subscriber.error(error);
        }
      });
      return () => controller.abort();
    });
  }

  private async consumeChatStream(messages: AiChatMessage[], signal: AbortSignal, subscriber: { next: (value: string) => void; error: (error: unknown) => void; complete: () => void }): Promise<void> {
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ messages, sessionId: this.getSessionId() }),
        signal,
      });
      if (!response.ok) {
        const payload = await this.readJson(response);
        throw new Error(payload?.error || 'Não foi possível conversar com a IA.');
      }
      if (!response.body) throw new Error('Seu navegador não suporta respostas em streaming.');
      this.availabilityState.set(true);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      while (!finished) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';
        for (const event of events) {
          for (const line of event.split(/\r?\n/)) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') { finished = true; break; }
            if (!data) continue;
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.delta) subscriber.next(String(parsed.delta));
          }
        }
        if (done) finished = true;
      }
      subscriber.complete();
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        this.availabilityState.set(false);
        subscriber.error(error);
      }
    }
  }

  private headers(): Record<string, string> {
    const token = this.auth.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private getSessionId(): string {
    this.sessionId ??= this.createSessionId();
    return this.sessionId;
  }

  private createSessionId(): string {
    const user = String(this.auth.currentUser()?.id || 'anonymous').trim().replace(/[^a-zA-Z0-9_-]+/g, '-') || 'anonymous';
    const randomValue = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Math.floor(Math.random() * 0xffffffff);
    return `Agenda-User-${user}-session-${Date.now()}${String(randomValue).padStart(10, '0')}`;
  }

  private async readJson(response: Response): Promise<any> {
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; }
    catch { return {}; }
  }
}
