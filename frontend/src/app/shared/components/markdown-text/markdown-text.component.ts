import { Component, ElementRef, EventEmitter, Input, Output, ViewEncapsulation, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { renderBasicMarkdown, toggleMarkdownChecklist } from '../../../core/utils/markdown.util';

@Component({
  selector: 'app-markdown-text',
  standalone: true,
  template: '<div class="markdown-text" [class.interactive]="interactive" [innerHTML]="safeHtml" (click)="handleClick($event)" (keydown)="handleKeydown($event)"></div>',
  styleUrl: './markdown-text.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MarkdownTextComponent {
  private sanitizer = inject(DomSanitizer);
  private elementRef = inject(ElementRef<HTMLElement>);

  private _text = '';
  safeHtml: SafeHtml = '';

  @Input() interactive = true;

  @Input() set text(value: string | null | undefined) {
    this._text = value || '';
    this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(renderBasicMarkdown(this._text));
  }

  get text(): string {
    return this._text;
  }

  @Output() textChange = new EventEmitter<string>();

  handleClick(event: MouseEvent): void {
    if (!this.interactive) return;

    const target = event.target as HTMLElement;
    if (target.closest('a')) return;

    const checklistItem = target.closest('.checklist-item') as HTMLElement;
    if (!checklistItem) return;

    event.stopPropagation();
    event.preventDefault();

    const root = this.elementRef.nativeElement;
    const allItems = Array.from(root.querySelectorAll('.checklist-item'));
    const targetIndex = allItems.indexOf(checklistItem);
    if (targetIndex < 0) return;

    const updatedText = toggleMarkdownChecklist(this._text, targetIndex);
    if (updatedText !== this._text) {
      this._text = updatedText;
      this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(renderBasicMarkdown(this._text));
      this.textChange.emit(this._text);
    }
  }

  handleKeydown(event: KeyboardEvent): void {
    if (!this.interactive) return;
    if (event.key !== ' ' && event.key !== 'Enter') return;

    const target = event.target as HTMLElement;
    if (target.closest('a')) return;

    const checklistItem = target.closest('.checklist-item') as HTMLElement;
    if (!checklistItem) return;

    event.stopPropagation();
    event.preventDefault();

    const root = this.elementRef.nativeElement;
    const allItems = Array.from(root.querySelectorAll('.checklist-item'));
    const targetIndex = allItems.indexOf(checklistItem);
    if (targetIndex < 0) return;

    const updatedText = toggleMarkdownChecklist(this._text, targetIndex);
    if (updatedText !== this._text) {
      this._text = updatedText;
      this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(renderBasicMarkdown(this._text));
      this.textChange.emit(this._text);
    }
  }
}


