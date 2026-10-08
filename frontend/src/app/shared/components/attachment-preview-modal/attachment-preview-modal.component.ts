import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { detectFileType, formatCodeWithHighlight, FileTypeInfo } from '../../../core/utils/code-highlight.util';
import { MarkdownTextComponent } from '../markdown-text/markdown-text.component';

@Component({
  selector: 'app-attachment-preview-modal',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, MatProgressSpinnerModule, MarkdownTextComponent],
  templateUrl: './attachment-preview-modal.component.html',
  styleUrl: './attachment-preview-modal.component.scss',
})
export class AttachmentPreviewModalComponent implements OnInit, OnChanges {
  private sanitizer = inject(DomSanitizer);

  @Input() fileName = '';
  @Input() fileUrl: string | null = null;
  @Input() mimeType = '';
  @Input() rawContent: string | null = null;
  @Input() byteSize?: number;

  @Output() close = new EventEmitter<void>();
  @Output() download = new EventEmitter<void>();

  readonly fileInfo = signal<FileTypeInfo>({
    id: 'other',
    name: 'Arquivo',
    category: 'other',
    icon: 'insert_drive_file',
    color: '#64748b',
    extension: '',
  });

  readonly trustedUrl = signal<SafeResourceUrl | null>(null);
  readonly highlightedCode = signal<string>('');
  readonly isCopied = signal(false);
  readonly contentLoading = signal(false);
  readonly currentText = signal<string>('');
  readonly markdownViewMode = signal<'rendered' | 'raw'>('rendered');

  ngOnInit(): void {
    this.refreshState();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.refreshState();
  }

  private refreshState(): void {
    const info = detectFileType(this.fileName, this.mimeType);
    this.fileInfo.set(info);

    if (this.fileUrl) {
      this.trustedUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.fileUrl));
    } else {
      this.trustedUrl.set(null);
    }

    if (info.category === 'code') {
      if (this.rawContent) {
        this.currentText.set(this.rawContent);
        this.contentLoading.set(false);
        this.highlightedCode.set(formatCodeWithHighlight(this.rawContent, info.id));
      } else if (this.fileUrl) {
        this.contentLoading.set(true);
        fetch(this.fileUrl)
          .then((res) => res.text())
          .then((text) => {
            this.currentText.set(text);
            this.highlightedCode.set(formatCodeWithHighlight(text, info.id));
            this.contentLoading.set(false);
          })
          .catch((err) => {
            console.error('Erro ao ler conteúdo para syntax highlight:', err);
            this.contentLoading.set(false);
          });
      } else {
        this.currentText.set('');
        this.highlightedCode.set('');
        this.contentLoading.set(false);
      }
    } else {
      this.currentText.set('');
      this.highlightedCode.set('');
      this.contentLoading.set(false);
    }
  }

  copyCode(): void {
    const textToCopy = this.currentText() || this.rawContent;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
    }).catch(err => {
      console.error('Falha ao copiar código:', err);
    });
  }

  formatarTamanho(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
