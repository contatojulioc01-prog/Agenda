import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { AfterViewInit, Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { AiConversationMessage, AiService } from '../../../core/services/ai.service';
import { AiOptionPrompt, ParsedAiContent, parseAiMessageContent } from '../../../core/utils/ai-message-parser.util';
import { renderBasicMarkdown } from '../../../core/utils/markdown.util';

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './ai-assistant.component.html',
  styleUrl: './ai-assistant.component.scss',
})
export class AiAssistantComponent {
export class AiAssistantComponent implements AfterViewInit {
  @ViewChild('messageList') private messageList?: ElementRef<HTMLElement>;
  readonly aiService = inject(AiService);
  readonly messages = this.aiService.conversationMessages;
  readonly isLoading = signal(false);
  readonly minimized = signal(false);
  readonly pendingSelections = signal<Record<number, string[]>>({});
  draft = '';
  private request?: Subscription;

  ngAfterViewInit(): void {
    // Ao (re)abrir o assistente, rola até a última mensagem automaticamente
    this.scrollToEnd();
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.request?.unsubscribe();
    this.aiService.closeAssistant();
  }

  newConversation(): void {
    this.request?.unsubscribe();
    this.isLoading.set(false);
    this.pendingSelections.set({});
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
    this.sendMessage(content);
  }

  sendMessage(content: string): void {
    if (!content || this.isLoading()) return;
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
        this.aiService.updateConversationMessage(assistantMessageId, item => ({
          ...item,
          content: 'Ocorreu um erro ao falar com a IA. Tente novamente.',
          error: true,
        }));
        this.isLoading.set(false);
        this.scrollToEnd();
      },
      complete: () => {
        const completed = this.messages().find(item => item.id === assistantMessageId);
        if (!completed?.content.trim()) {
          this.aiService.updateConversationMessage(assistantMessageId, item => ({
            ...item,
            content: 'A IA não retornou uma resposta. Tente novamente.',
            error: true,
          }));
        }
        this.isLoading.set(false);
        this.scrollToEnd();
      },
    });
  }

  parseContent(rawContent: string): ParsedAiContent {
    return parseAiMessageContent(rawContent);
  }

  formatMessage(content: string): string {
    return renderBasicMarkdown(content);
  }

  isOptionPending(messageId: number, option: string): boolean {
    const current = this.pendingSelections()[messageId] || [];
    return current.includes(option);
  }

  getPendingCount(messageId: number): number {
    return (this.pendingSelections()[messageId] || []).length;
  }

  isAllPendingSelected(messageId: number, options: string[]): boolean {
    const current = this.pendingSelections()[messageId] || [];
    return options.length > 0 && options.every(opt => current.includes(opt));
  }

  toggleSelectAll(messageId: number, options: string[]): void {
    if (this.isLoading()) return;
    const current = this.pendingSelections()[messageId] || [];
    const allSelected = options.every(opt => current.includes(opt));
    this.pendingSelections.update(map => ({
      ...map,
      [messageId]: allSelected ? [] : [...options],
    }));
  }

  onOptionClick(message: AiConversationMessage, _prompt: AiOptionPrompt, option: string): void {
    if (this.isLoading()) return;
    // Chip click always submits that single option immediately
    this.aiService.updateConversationMessage(message.id, item => ({
      ...item,
      selectedOptions: [option],
    }));
    this.sendMessage(`Gostaria de ver referente a: ${option}`);
  }

  submitPendingSelection(message: AiConversationMessage, prompt: AiOptionPrompt): void {
    if (this.isLoading()) return;
    const current = this.pendingSelections()[message.id] || [];
    const selection = current.length > 0 ? current : [...prompt.options];

    this.aiService.updateConversationMessage(message.id, item => ({
      ...item,
      selectedOptions: selection,
    }));

    const text = `Gostaria de ver referente a: ${selection.join(', ')}`;
    this.sendMessage(text);
  }

  private scrollToEnd(): void {
    setTimeout(() => {
      const element = this.messageList?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }
}
