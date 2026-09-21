import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild, ViewEncapsulation } from '@angular/core';
import { renderBasicMarkdown } from '../../../core/utils/markdown.util';

@Component({
  selector: 'app-markdown-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './markdown-editor.component.html',
  styleUrl: './markdown-editor.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MarkdownEditorComponent implements AfterViewInit {
  @ViewChild('editor') private editorRef?: ElementRef<HTMLDivElement>;
  @Input() placeholder = 'Digite uma descrição...';
  @Input() maxLength = 5000;
  @Input() ariaLabel = 'Descrição';
  @Input() editorId: string | null = null;
  @Output() readonly textChange = new EventEmitter<string>();

  private value = '';
  private viewReady = false;
  private composing = false;
  private isUserFocused = false;

  @Input()
  set text(nextValue: string | null | undefined) {
    const normalized = String(nextValue || '');
    if (normalized === this.value) return;
    this.value = normalized;
    if (this.viewReady && !this.isUserFocused) {
      this.renderValue(false);
    }
  }

  get text(): string {
    return this.value;
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderValue(false);
  }

  onFocus(): void {
    this.isUserFocused = true;
  }

  onBlur(): void {
    this.isUserFocused = false;
    const editor = this.editorRef?.nativeElement;
    if (editor) {
      this.value = this.toMarkdown(editor);
      this.renderValue(false);
      this.textChange.emit(this.value);
    }
  }

  onCompositionStart(): void {
    this.composing = true;
  }

  onCompositionEnd(event: CompositionEvent): void {
    this.composing = false;
    this.onInput(event);
  }

  onInput(event: Event): void {
    if (this.composing) return;
    const editor = event.currentTarget as HTMLDivElement;
    let markdown = this.toMarkdown(editor);
    if (markdown.length > this.maxLength) {
      markdown = markdown.slice(0, this.maxLength);
    }
    this.value = markdown;
    this.textChange.emit(markdown);
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  }

  private renderValue(restoreCaret: boolean, caretOffset = 0): void {
    const editor = this.editorRef?.nativeElement;
    if (!editor) return;
    const nextHtml = renderBasicMarkdown(this.value);
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
    if (restoreCaret) {
      this.restoreCaret(editor, caretOffset);
    }
  }

  private getCaretOffset(root: HTMLElement): number {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return root.textContent?.length || 0;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.endContainer)) return root.textContent?.length || 0;
    const prefix = range.cloneRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(range.endContainer, range.endOffset);
    return prefix.toString().length;
  }

  private restoreCaret(root: HTMLElement, requestedOffset: number): void {
    const selection = window.getSelection();
    if (!selection) return;
    const visibleLength = root.textContent?.length || 0;
    const blocks = root.querySelectorAll('p, li');
    const trailingBlock = blocks.item(blocks.length - 1) as HTMLElement | null;
    if (trailingBlock && !trailingBlock.textContent && requestedOffset >= visibleLength) {
      const range = document.createRange();
      range.selectNodeContents(trailingBlock);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, requestedOffset);
    let node: Node | null = walker.nextNode();
    let lastTextNode: Node | null = null;
    while (node) {
      lastTextNode = node;
      const length = node.textContent?.length || 0;
      if (remaining <= length) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      remaining -= length;
      node = walker.nextNode();
    }
    const range = document.createRange();
    const formattedParent = lastTextNode?.parentElement?.closest('strong, em, code');
    if (requestedOffset > visibleLength && formattedParent?.parentNode) range.setStartAfter(formattedParent);
    else if (lastTextNode) range.setStart(lastTextNode, lastTextNode.textContent?.length || 0);
    else range.selectNodeContents(root);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private toMarkdown(root: HTMLElement): string {
    return Array.from(root.childNodes)
      .map(node => this.nodeToMarkdown(node))
      .join('\n')
      .replace(/\u00a0/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '');
  }

  private nodeToMarkdown(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const children = () => Array.from(element.childNodes).map(child => this.nodeToMarkdown(child)).join('');

    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return `**${children()}**`;
    if (tag === 'em' || tag === 'i') return `*${children()}*`;
    if (tag === 'code') return `\`${children()}\``;
    if (tag === 'table') {
      const rows = Array.from(element.querySelectorAll('tr')).map(row =>
        Array.from(row.querySelectorAll(':scope > th, :scope > td')).map(cell =>
          Array.from(cell.childNodes).map(child => this.nodeToMarkdown(child)).join('').trim()
        )
      ).filter(row => row.length);
      if (!rows.length) return '';
      const width = rows[0].length;
      return [
        `| ${rows[0].join(' | ')} |`,
        `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
        ...rows.slice(1).map(row => `| ${Array.from({ length: width }, (_, index) => row[index] || '').join(' | ')} |`),
      ].join('\n');
    }
    if (tag === 'blockquote') {
      const content = Array.from(element.childNodes).map(child => this.nodeToMarkdown(child)).join('\n');
      return content.split('\n').map(line => `> ${line}`).join('\n');
    }
    if (tag === 'ul' || tag === 'ol') {
      return Array.from(element.children).map((child, index) => {
        const marker = tag === 'ol' ? `${index + 1}.` : '-';
        return `${marker} ${Array.from(child.childNodes).map(item => this.nodeToMarkdown(item)).join('').trim()}`;
      }).join('\n');
    }
    if (tag === 'li') return children();
    if (tag === 'p' || tag === 'div') {
      if (element.childNodes.length === 1 && element.firstChild instanceof HTMLBRElement) return '';
      return children();
    }
    return children();
  }
}
