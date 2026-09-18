import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AiService, AiTextAction } from '../../../core/services/ai.service';

@Component({
  selector: 'app-ai-text-button',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
  templateUrl: './ai-text-button.component.html',
  styleUrl: './ai-text-button.component.scss',
})
export class AiTextButtonComponent {
  @Input() text = '';
  @Output() readonly textChange = new EventEmitter<string>();
  private readonly aiService = inject(AiService);
  readonly isMenuOpen = signal(false);
  readonly isLoading = signal(false);
  readonly activeAction = signal<AiTextAction | null>(null);
  readonly errorMessage = signal('');
  readonly actions: { id: AiTextAction; label: string; icon: string }[] = [
    { id: 'improve', label: 'Melhorar escrita', icon: 'auto_fix_high' },
    { id: 'review', label: 'Revisão', icon: 'spellcheck' },
    { id: 'explain', label: 'Explicar', icon: 'lightbulb' },
    { id: 'reformat', label: 'Reformatar', icon: 'format_align_left' },
  ];

  toggleMenu(): void {
    this.errorMessage.set('');
    this.isMenuOpen.update(open => !open);
  }

  runAction(action: AiTextAction): void {
    if (!this.text.trim() || this.isLoading()) return;
    this.activeAction.set(action);
    this.isLoading.set(true);
    this.isMenuOpen.set(false);
    this.errorMessage.set('');
    this.aiService.textAction(this.text, action).subscribe({
      next: result => this.textChange.emit(result),
      error: () => {
        this.errorMessage.set('Não foi possível processar o texto. Tente novamente.');
        this.isLoading.set(false);
        this.activeAction.set(null);
      },
      complete: () => {
        this.isLoading.set(false);
        this.activeAction.set(null);
      },
    });
  }
}
