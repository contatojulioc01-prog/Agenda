import { Component, Input, ViewEncapsulation } from '@angular/core';
import { renderBasicMarkdown } from '../../../core/utils/markdown.util';

@Component({
  selector: 'app-markdown-text',
  standalone: true,
  template: '<div class="markdown-text" [innerHTML]="html"></div>',
  styleUrl: './markdown-text.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MarkdownTextComponent {
  html = '';

  @Input() set text(value: string | null | undefined) {
    this.html = renderBasicMarkdown(value || '');
  }
}
