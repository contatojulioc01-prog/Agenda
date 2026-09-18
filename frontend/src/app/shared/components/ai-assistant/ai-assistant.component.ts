import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { AiService } from '../../../core/services/ai.service';
import { renderBasicMarkdown } from '../../../core/utils/markdown.util';

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './ai-assistant.component.html',
  styleUrl: './ai-assistant.component.scss',
})
export class AiAssistantComponent {
  @ViewChild('messageList') private messageList?: ElementRef<HTMLElement>;
  readonly aiService = inject(AiService);
  readonly messages = this.aiService.conversationMessages;
  readonly isLoading = signal(false);
  readonly minimized = signal(false);
  draft = '';
  private request?: Subscription;

  @HostListener('document:keydown.escape')
  close(): void {
    this.request?.unsubscribe();
    this.aiService.closeAssistant();
  }

  newConversation(): void {
    this.request?.unsubscribe();
    this.isLoading.set(false);
    this.aiService.newConversation();
    this.draft = '';
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  send(): void {
    const content = this.draft.trim();
    if (!content || this.isLoading()) return;
    this.draft = '';
    this.aiService.addConversationMessage('user', content);
    const assistantMessage = this.aiService.addConversationMessage('assistant', '');
    const assistantMessageId = assistantMessage.id;
    this.isLoading.set(true);
    this.scrollToEnd();

    const history = this.messages()
      .filter(message => message.content && !message.error)
      .map(({ role, content }) => ({ role, content }));
    this.request = this.aiService.chat(history).subscribe({
      next: delta => {
        this.aiService.updateConversationMessage(assistantMessageId, item => ({ ...item, content: item.content + delta }));
        this.scrollToEnd();
      },
      error: () => {
        this.aiService.updateConversationMessage(assistantMessageId, item => ({ ...item, content: 'Ocorreu um erro ao falar com a IA. Tente novamente.', error: true }));
        this.isLoading.set(false);
        this.scrollToEnd();
      },
      complete: () => {
        const completed = this.messages().find(item => item.id === assistantMessageId);
        if (!completed?.content.trim()) {
          this.aiService.updateConversationMessage(assistantMessageId, item => ({ ...item, content: 'A IA não retornou uma resposta. Tente novamente.', error: true }));
        }
        this.isLoading.set(false);
        this.scrollToEnd();
      },
    });
  }

  formatMessage(content: string): string {
    return renderBasicMarkdown(content);
  }

  private scrollToEnd(): void {
    setTimeout(() => {
      const element = this.messageList?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }
}
