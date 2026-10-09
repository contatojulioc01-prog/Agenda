import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  ViewEncapsulation,
  forwardRef,
  signal,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface LinkModalTarget {
  url: string;
  text: string;
  fullMarkdown?: string;
  start: number;
  end: number;
}

interface TextSelection {
  start: number;
  end: number;
}

interface HistoryEntry extends TextSelection {
  value: string;
}

type ToolbarFormat = 'bold' | 'italic' | 'strike' | 'heading' | 'list' | 'checklist' | 'quote' | 'code';

const BLOCK_TAGS = /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TABLE|TR)$/;
const BLOCK_PREFIX = /^(\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?|#{1,6}\s+))/;
const INLINE_TOKENS =
  /(`+)([^`]+?)\1|(\*\*\*|___)(?=\S)(.+?)(?<=\S)\3|(\*\*|__)(?=\S)(.+?)(?<=\S)\5|(\*|_)(?=[^\s*_])(.+?)(?<=[^\s*_])\7|~~(?=\S)(.+?)(?<=\S)~~|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;

/**
 * Editor Markdown com pré-visualização em tempo real e menu de contexto.
 *
 * O conteúdo do DOM é sempre idêntico ao texto Markdown (os marcadores como `**`, `#` e `-`
 * permanecem no texto, apenas esmaecidos). Isso garante que nenhuma digitação seja perdida e
 * que o cursor seja restaurado com precisão após cada nova renderização.
 */
@Component({
  selector: 'app-markdown-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule, MatMenuModule, MatDividerModule],
  templateUrl: './markdown-editor.component.html',
  styleUrl: './markdown-editor.component.scss',
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MarkdownEditorComponent),
      multi: true,
    },
  ],
})
export class MarkdownEditorComponent implements AfterViewInit, ControlValueAccessor {
  @ViewChild('editor') private editorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('contextMenuTrigger', { read: MatMenuTrigger }) private contextMenuTrigger?: MatMenuTrigger;

  @Input() placeholder = 'Digite uma descrição...';
  @Input() maxLength = 5000;
  @Input() ariaLabel = 'Descrição';
  @Input() editorId: string | null = null;
  @Input() showToolbar = true;
  @Output() readonly textChange = new EventEmitter<string>();

  private value = '';
  private viewReady = false;
  private composing = false;
  private isUserFocused = false;
  private lastSelection: TextSelection = { start: 0, end: 0 };
  private contextSelection: TextSelection = { start: 0, end: 0 };

  // Estado do menu de contexto
  contextMenuPosition = { x: '0px', y: '0px' };
  readonly hasSelection = signal(false);

  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private lastHistoryAt = 0;

  // Estado da modal de hyperlink
  readonly showLinkModal = signal(false);
  linkModalUrl = '';
  linkModalText = '';
  readonly linkModalTarget = signal<LinkModalTarget | null>(null);

  private onChange: (val: string) => void = () => {};
  private onTouched: () => void = () => {};

  // ───────────────────────── ControlValueAccessor / Inputs ─────────────────────────

  writeValue(val: string | null | undefined): void {
    this.setExternalValue(val);
  }

  registerOnChange(fn: (val: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  @Input()
  set text(nextValue: string | null | undefined) {
    this.setExternalValue(nextValue);
  }

  get text(): string {
    return this.value;
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.render();
  }

  private setExternalValue(val: string | null | undefined): void {
    const normalized = String(val ?? '').replace(/\r\n?/g, '\n');
    if (normalized === this.value) return;
    this.value = normalized;
    if (this.viewReady && !this.isUserFocused) this.render();
  }

  // ───────────────────────── Eventos do editor ─────────────────────────

  onFocus(): void {
    this.isUserFocused = true;
  }

  onBlur(): void {
    this.isUserFocused = false;
    this.onTouched();
  }

  onCompositionStart(): void {
    this.composing = true;
  }

  onCompositionEnd(): void {
    this.composing = false;
    this.syncFromDom();
  }

  onInput(): void {
    if (this.composing) return;
    this.syncFromDom();
  }

  @HostListener('document:selectionchange')
  onSelectionChange(): void {
    if (!this.isUserFocused) return;
    const selection = this.readDomSelection();
    if (selection) this.lastSelection = selection;
  }

  onKeyDown(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (mod && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.undo();
      return;
    }
    if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
      event.preventDefault();
      this.redo();
      return;
    }
    if (mod && key === 'b') {
      event.preventDefault();
      this.applyToolbarFormat('bold');
      return;
    }
    if (mod && key === 'i') {
      event.preventDefault();
      this.applyToolbarFormat('italic');
      return;
    }
    if (mod && key === 'k') {
      event.preventDefault();
      this.openLinkModalFromToolbar();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.handleEnter(event.shiftKey);
      return;
    }
    if (event.key === 'Tab' && !mod) {
      event.preventDefault();
      this.replaceSelection('  ');
    }
  }

  onBeforeInput(event: InputEvent): void {
    if (event.inputType === 'historyUndo') {
      event.preventDefault();
      this.undo();
    } else if (event.inputType === 'historyRedo') {
      event.preventDefault();
      this.redo();
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text/plain') || '').replace(/\r\n?/g, '\n');
    if (pasted) this.replaceSelection(pasted);
  }

  onEditorClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // 1. Clique no marcador de tarefa / checkbox no editor
    const taskMark = target.closest('.md-task') as HTMLElement | null;
    if (taskMark) {
      const start = this.offsetOfNode(taskMark);
      if (start >= 0) {
        const charAt = this.value.slice(start, start + 3);
        const match = charAt.match(/^\[([ xX])\]$/);
        if (match) {
          event.preventDefault();
          event.stopPropagation();
          const isDone = match[1].toLowerCase() === 'x';
          const newChar = isDone ? ' ' : 'x';
          const nextValue = this.value.slice(0, start + 1) + newChar + this.value.slice(start + 2);
          this.commit(nextValue, start, start + 3);
          return;
        }
      }
    }

    // 2. Clique em hyperlinks
    const linkText = target.closest('.md-link, .md-autolink') as HTMLElement | null;
    if (!linkText) return;

    const wrapper = (linkText.closest('.md-link-wrap') as HTMLElement | null) || linkText;
    const start = this.offsetOfNode(wrapper);
    if (start < 0) return;
    const end = start + (wrapper.textContent || '').length;
    const url = wrapper.dataset['url'] || linkText.textContent || '';
    const isMarkdownLink = wrapper.classList.contains('md-link-wrap');
    const label = isMarkdownLink ? linkText.textContent || '' : '';

    event.preventDefault();
    this.openLinkModal({
      url,
      text: label,
      fullMarkdown: isMarkdownLink ? this.value.slice(start, end) : undefined,
      start,
      end,
    });
  }

  // ───────────────────────── Menu de contexto e Barra de ferramentas ─────────────────────────

  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    const sel = this.readDomSelection() ?? this.currentSelection();
    this.contextSelection = sel;
    this.hasSelection.set(sel.start !== sel.end);
    this.contextMenuPosition = {
      x: `${event.clientX}px`,
      y: `${event.clientY}px`,
    };
    this.contextMenuTrigger?.openMenu();
  }

  applyContextFormat(format: ToolbarFormat): void {
    this.editorRef?.nativeElement.focus();
    this.setDomSelection(this.contextSelection.start, this.contextSelection.end);
    this.applyToolbarFormat(format);
  }

  openContextLinkModal(): void {
    this.editorRef?.nativeElement.focus();
    this.setDomSelection(this.contextSelection.start, this.contextSelection.end);
    this.openLinkModalFromToolbar();
  }

  applyToolbarFormat(format: ToolbarFormat): void {
    switch (format) {
      case 'bold':
        this.toggleWrap('**', 'texto em negrito');
        break;
      case 'italic':
        this.toggleWrap('*', 'texto em itálico');
        break;
      case 'strike':
        this.toggleWrap('~~', 'texto riscado');
        break;
      case 'code':
        this.toggleWrap('`', 'código');
        break;
      case 'heading':
        this.toggleLinePrefix(/^#{1,6}\s+/, '### ');
        break;
      case 'list':
        this.toggleLinePrefix(/^\s*[-*+]\s+(?!\[[ xX]\])/, '- ');
        break;
      case 'checklist':
        this.toggleLinePrefix(/^\s*[-*+]\s+\[[ xX]\]\s+/, '- [ ] ');
        break;
      case 'quote':
        this.toggleLinePrefix(/^\s*>\s?/, '> ');
        break;
    }
  }

  private toggleWrap(marker: string, placeholder: string): void {
    const { start, end } = this.currentSelection();
    const v = this.value;
    const len = marker.length;

    if (start !== end) {
      const alreadyWrapped = v.slice(start - len, start) === marker && v.slice(end, end + len) === marker;
      if (alreadyWrapped) {
        const next = v.slice(0, start - len) + v.slice(start, end) + v.slice(end + len);
        this.commit(next, start - len, end - len);
      } else {
        const next = v.slice(0, start) + marker + v.slice(start, end) + marker + v.slice(end);
        this.commit(next, start + len, end + len);
      }
      return;
    }

    const next = v.slice(0, start) + marker + placeholder + marker + v.slice(end);
    this.commit(next, start + len, start + len + placeholder.length);
  }

  private toggleLinePrefix(pattern: RegExp, prefix: string): void {
    const { start, end } = this.currentSelection();
    const v = this.value;
    const blockStart = v.lastIndexOf('\n', start - 1) + 1;
    const nextBreak = v.indexOf('\n', end);
    const blockEnd = nextBreak === -1 ? v.length : nextBreak;
    const lines = v.slice(blockStart, blockEnd).split('\n');
    const removing = lines.every(line => pattern.test(line));

    let firstDelta = 0;
    const updated = lines.map((line, index) => {
      const next = removing ? line.replace(pattern, '') : prefix + line.replace(BLOCK_PREFIX, '');
      if (index === 0) firstDelta = next.length - line.length;
      return next;
    });

    const replacement = updated.join('\n');
    const totalDelta = replacement.length - (blockEnd - blockStart);
    const next = v.slice(0, blockStart) + replacement + v.slice(blockEnd);
    this.commit(next, Math.max(blockStart, start + firstDelta), Math.max(blockStart, end + totalDelta));
  }

  private handleEnter(plainBreak: boolean): void {
    const { start, end } = this.currentSelection();
    const v = this.value;
    const lineStart = v.lastIndexOf('\n', start - 1) + 1;
    const nextBreak = v.indexOf('\n', start);
    const lineEnd = nextBreak === -1 ? v.length : nextBreak;
    const beforeCaret = v.slice(lineStart, start);
    let insert = '\n';

    if (!plainBreak) {
      const list = beforeCaret.match(/^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/);
      const quote = list ? null : beforeCaret.match(/^(\s*>\s?)/);
      const marker = list?.[0] ?? quote?.[0];

      if (marker !== undefined) {
        const itemIsEmpty = !v.slice(lineStart + marker.length, lineEnd).trim();
        if (itemIsEmpty && start === end) {
          // Enter em item vazio: encerra a lista/citação removendo o marcador.
          const next = v.slice(0, lineStart) + v.slice(lineStart + marker.length);
          this.commit(next, lineStart, lineStart);
          return;
        }

        if (list) {
          const numbered = list[2].match(/^(\d+)([.)])$/);
          const bullet = numbered ? `${Number(numbered[1]) + 1}${numbered[2]}` : list[2];
          insert = `\n${list[1]}${bullet}${list[3]}${list[4] ? '[ ] ' : ''}`;
        } else if (quote) {
          insert = `\n${quote[1]}`;
        }
      }
    }

    this.replaceSelection(insert);
  }

  // ───────────────────────── Modal de hyperlink ─────────────────────────

  openLinkModalFromToolbar(): void {
    const { start, end } = this.currentSelection();
    const selected = this.value.slice(start, end);
    const isUrl = /^(https?:\/\/|www\.)\S+$/i.test(selected.trim());
    this.openLinkModal({
      url: isUrl ? selected.trim() : '',
      text: isUrl ? '' : selected,
      start,
      end,
    });
  }

  private openLinkModal(target: LinkModalTarget): void {
    this.linkModalUrl = target.url;
    this.linkModalText = target.text;
    this.linkModalTarget.set(target);
    this.showLinkModal.set(true);
  }

  closeLinkModal(): void {
    this.showLinkModal.set(false);
    this.linkModalTarget.set(null);
  }

  applyLinkModal(): void {
    let url = this.linkModalUrl.trim();
    if (!url) return;
    if (!/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url)) url = `https://${url}`;

    const label = this.linkModalText.trim() || url;
    const markdown = `[${label}](${url})`;
    const target = this.linkModalTarget() ?? { ...this.lastSelection, url: '', text: '' };
    const next = this.value.slice(0, target.start) + markdown + this.value.slice(target.end);
    const caret = target.start + markdown.length;

    this.closeLinkModal();
    this.commit(next, caret, caret);
  }

  removeLinkFromModal(): void {
    const target = this.linkModalTarget();
    if (!target) return;
    const plain = target.text || target.url;
    const next = this.value.slice(0, target.start) + plain + this.value.slice(target.end);
    const caret = target.start + plain.length;

    this.closeLinkModal();
    this.commit(next, caret, caret);
  }

  // ───────────────────────── Núcleo: sincronização e histórico ─────────────────────────

  /** Lê o texto do DOM após uma edição nativa e re-renderiza preservando o cursor. */
  private syncFromDom(): void {
    const editor = this.editorRef?.nativeElement;
    if (!editor) return;

    const domSelection = window.getSelection();
    const range = domSelection?.rangeCount ? domSelection.getRangeAt(0) : null;
    const points = range && editor.contains(range.startContainer)
      ? [
          { node: range.startContainer, offset: range.startOffset },
          { node: range.endContainer, offset: range.endOffset },
        ]
      : [];

    const { text, offsets } = this.readDom(editor, points);
    let next = text;
    if (next.length > this.maxLength) next = next.slice(0, this.maxLength);

    const start = Math.min(offsets[0] ?? next.length, next.length);
    const end = Math.min(offsets[1] ?? start, next.length);

    if (next !== this.value) this.pushHistory(false);
    this.value = next;
    this.emitValue();
    this.render();
    this.setDomSelection(start, end);
  }

  /** Aplica uma alteração programática (toolbar, Enter, colar, links). */
  private commit(next: string, selStart: number, selEnd: number): void {
    if (next.length > this.maxLength) next = next.slice(0, this.maxLength);
    this.pushHistory(true);
    this.value = next;
    this.emitValue();
    this.render();
    this.editorRef?.nativeElement.focus();
    this.setDomSelection(Math.min(selStart, next.length), Math.min(selEnd, next.length));
  }

  private replaceSelection(insert: string): void {
    const { start, end } = this.currentSelection();
    const next = this.value.slice(0, start) + insert + this.value.slice(end);
    const caret = start + insert.length;
    this.commit(next, caret, caret);
  }

  private emitValue(): void {
    this.textChange.emit(this.value);
    this.onChange(this.value);
  }

  private pushHistory(force: boolean): void {
    const now = Date.now();
    if (!force && this.undoStack.length && now - this.lastHistoryAt < 800) return;
    this.lastHistoryAt = now;
    this.undoStack.push({ value: this.value, ...this.lastSelection });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  private undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push({ value: this.value, ...this.currentSelection() });
    this.restoreEntry(entry);
  }

  private redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push({ value: this.value, ...this.currentSelection() });
    this.restoreEntry(entry);
  }

  private restoreEntry(entry: HistoryEntry): void {
    this.value = entry.value;
    this.lastHistoryAt = 0;
    this.emitValue();
    this.render();
    this.setDomSelection(entry.start, entry.end);
  }

  // ───────────────────────── Seleção (offsets no texto Markdown) ─────────────────────────

  private currentSelection(): TextSelection {
    const selection = this.readDomSelection() ?? this.lastSelection;
    const start = Math.min(selection.start, selection.end, this.value.length);
    const end = Math.min(Math.max(selection.start, selection.end), this.value.length);
    return { start, end };
  }

  private readDomSelection(): TextSelection | null {
    const editor = this.editorRef?.nativeElement;
    const domSelection = window.getSelection();
    if (!editor || !domSelection?.rangeCount) return null;
    const range = domSelection.getRangeAt(0);
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;

    const { offsets } = this.readDom(editor, [
      { node: range.startContainer, offset: range.startOffset },
      { node: range.endContainer, offset: range.endOffset },
    ]);
    const length = this.value.length;
    return {
      start: Math.min(offsets[0] < 0 ? length : offsets[0], length),
      end: Math.min(offsets[1] < 0 ? length : offsets[1], length),
    };
  }

  private offsetOfNode(node: Node): number {
    const editor = this.editorRef?.nativeElement;
    if (!editor) return -1;
    return this.readDom(editor, [{ node, offset: 0 }]).offsets[0];
  }

  private setDomSelection(start: number, end: number): void {
    const editor = this.editorRef?.nativeElement;
    const domSelection = window.getSelection();
    if (!editor || !domSelection) return;

    const startPoint = this.pointAt(editor, start);
    const endPoint = start === end ? startPoint : this.pointAt(editor, end);
    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    domSelection.removeAllRanges();
    domSelection.addRange(range);
    this.lastSelection = { start, end };
  }

  /** Converte um offset do texto Markdown em uma posição no DOM renderizado. */
  private pointAt(editor: HTMLElement, offset: number): { node: Node; offset: number } {
    const lines = Array.from(editor.children) as HTMLElement[];
    if (!lines.length) return { node: editor, offset: 0 };

    let remaining = Math.max(0, offset);
    for (let index = 0; index < lines.length; index += 1) {
      const lineLength = (lines[index].textContent || '').length;
      if (remaining <= lineLength || index === lines.length - 1) {
        return this.pointInLine(lines[index], Math.min(remaining, lineLength));
      }
      remaining -= lineLength + 1;
    }
    return { node: editor, offset: editor.childNodes.length };
  }

  private pointInLine(line: HTMLElement, column: number): { node: Node; offset: number } {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let remaining = column;
    let last: Text | null = null;
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const length = node.data.length;
      if (remaining <= length) return { node, offset: remaining };
      remaining -= length;
      last = node;
    }
    return last ? { node: last, offset: last.data.length } : { node: line, offset: 0 };
  }

  /**
   * Converte o DOM editável em texto (uma linha por bloco) e localiza os pontos informados
   * como offsets nesse texto. Funciona tanto com o HTML renderizado quanto com as estruturas
   * que o navegador cria durante a digitação (text nodes soltos, <div>, <br>, etc.).
   */
  private readDom(root: HTMLElement, points: Array<{ node: Node; offset: number }>): { text: string; offsets: number[] } {
    const lines: string[] = [];
    const offsets = points.map(() => -1);
    let current = '';
    let consumed = 0;

    const position = () => consumed + current.length;
    const markBoundary = (parent: Node, index: number) => {
      points.forEach((point, i) => {
        if (offsets[i] < 0 && point.node === parent && point.offset === index) offsets[i] = position();
      });
    };
    const flush = () => {
      lines.push(current);
      consumed += current.length + 1;
      current = '';
    };
    const hasContentAfter = (node: Node) => {
      for (let next = node.nextSibling; next; next = next.nextSibling) {
        if (next.nodeType === Node.ELEMENT_NODE || (next.textContent || '').length > 0) return true;
      }
      return false;
    };

    const walk = (node: Node) => {
      const children = Array.from(node.childNodes);
      children.forEach((child, index) => {
        markBoundary(node, index);
        if (child.nodeType === Node.TEXT_NODE) {
          const data = (child.textContent || '').replace(/\u00a0/g, ' ');
          points.forEach((point, i) => {
            if (offsets[i] < 0 && point.node === child) offsets[i] = position() + Math.min(point.offset, data.length);
          });
          current += data;
          return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;

        const element = child as HTMLElement;
        if (element.tagName === 'BR') {
          if (hasContentAfter(element)) flush();
          return;
        }
        if (BLOCK_TAGS.test(element.tagName)) {
          if (current.length > 0) flush();
          walk(element);
          flush();
          return;
        }
        walk(element);
      });
      markBoundary(node, children.length);
    };

    walk(root);
    if (current.length > 0 || lines.length === 0) lines.push(current);

    const text = lines.join('\n');
    return { text, offsets: offsets.map(offset => (offset < 0 ? offset : Math.min(offset, text.length))) };
  }

  // ───────────────────────── Renderização (realce de sintaxe) ─────────────────────────

  private render(): void {
    const editor = this.editorRef?.nativeElement;
    if (!editor) return;
    const html = this.highlight(this.value);
    if (editor.innerHTML !== html) editor.innerHTML = html;
  }

  private highlight(markdown: string): string {
    if (!markdown) return '';
    let inFence = false;

    return markdown
      .split('\n')
      .map(line => {
        let classes = 'md-line';
        let html: string;

        if (/^\s*```/.test(line)) {
          inFence = !inFence;
          classes += ' md-fence';
          html = this.mark(line);
        } else if (inFence) {
          classes += ' md-code-line';
          html = this.escape(line);
        } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
          classes += ' md-hr';
          html = this.mark(line);
        } else {
          const heading = line.match(/^(#{1,6})(\s+)(.*)$/);
          const quote = line.match(/^(\s*>\s?)(.*)$/);
          const list = line.match(/^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/);
          const standaloneTask = line.match(/^(\s*)\[([ xX])\](\s+|$)(.*)$/);

          if (heading) {
            classes += ` md-heading md-h${heading[1].length}`;
            html = this.mark(heading[1] + heading[2]) + this.inline(heading[3]);
          } else if (quote) {
            classes += ' md-quote';
            html = this.mark(quote[1]) + this.inline(quote[2]);
          } else if (standaloneTask) {
            classes += ' md-li';
            const done = standaloneTask[2].toLowerCase() === 'x';
            if (done) classes += ' md-task-done';
            html = this.escape(standaloneTask[1]) +
              `<span class="md-mark md-task${done ? ' is-done' : ''}">[${this.escape(standaloneTask[2])}]</span>` +
              this.escape(standaloneTask[3]) +
              this.inline(standaloneTask[4]);
          } else if (list) {
            classes += ' md-li';
            const task = list[4].match(/^\[([ xX])\](\s+|$)(.*)$/);
            html = this.escape(list[1]) + `<span class="md-mark md-bullet">${this.escape(list[2])}</span>` + this.escape(list[3]);
            if (task) {
              const done = task[1].toLowerCase() === 'x';
              if (done) classes += ' md-task-done';
              html += `<span class="md-mark md-task${done ? ' is-done' : ''}">[${this.escape(task[1])}]</span>` + this.escape(task[2]) + this.inline(task[3]);
            } else {
              html += this.inline(list[4]);
            }
          } else {
            html = this.inline(line);
          }
        }

        return `<div class="${classes}">${html || '<br>'}</div>`;
      })
      .join('');
  }

  private inline(text: string): string {
    if (!text) return '';
    const pattern = new RegExp(INLINE_TOKENS.source, 'g');
    let output = '';
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text))) {
      const underscore = (match[3] || match[5] || match[7] || '').startsWith('_');
      if (underscore && match.index > 0 && /\w/.test(text[match.index - 1])) {
        pattern.lastIndex = match.index + 1;
        continue;
      }

      output += this.escape(text.slice(last, match.index));
      last = pattern.lastIndex;

      if (match[1]) {
        output += `<code class="md-code">${this.mark(match[1])}${this.escape(match[2])}${this.mark(match[1])}</code>`;
      } else if (match[3]) {
        output += `<strong class="md-strong"><em>${this.mark(match[3])}${this.inline(match[4])}${this.mark(match[3])}</em></strong>`;
      } else if (match[5]) {
        output += `<strong class="md-strong">${this.mark(match[5])}${this.inline(match[6])}${this.mark(match[5])}</strong>`;
      } else if (match[7]) {
        output += `<em class="md-em">${this.mark(match[7])}${this.inline(match[8])}${this.mark(match[7])}</em>`;
      } else if (match[9] !== undefined) {
        output += `<del class="md-del">${this.mark('~~')}${this.inline(match[9])}${this.mark('~~')}</del>`;
      } else if (match[10] !== undefined) {
        output +=
          `<span class="md-link-wrap" data-url="${this.escape(match[11])}">` +
          `${this.mark('[')}<span class="md-link">${this.escape(match[10])}</span>${this.mark('](')}` +
          `<span class="md-mark md-url">${this.escape(match[11])}</span>${this.mark(')')}</span>`;
      } else if (match[12]) {
        output += `<span class="md-autolink" data-url="${this.escape(match[12])}">${this.escape(match[12])}</span>`;
      }
    }

    return output + this.escape(text.slice(last));
  }

  private mark(value: string): string {
    return value ? `<span class="md-mark">${this.escape(value)}</span>` : '';
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
