import { Component, EventEmitter, Input, OnInit, Output, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { finalize, forkJoin, of } from 'rxjs';

import { MuralGroup, MuralItem, MuralItemInput } from '../../../core/models/mural.model';
import { Attachment } from '../../../core/models/attachment.model';
import { AttachmentsService } from '../../../core/services/attachments.service';
import { AuthService } from '../../../core/services/auth.service';
import { MuralItemModalService } from './mural-item-modal.service';
import { AiTextButtonComponent } from '../../../shared/components/ai-text-button/ai-text-button.component';
import { MarkdownEditorComponent } from '../../../shared/components/markdown-editor/markdown-editor.component';
import { MarkdownTextComponent } from '../../../shared/components/markdown-text/markdown-text.component';
import { AttachmentPreviewModalComponent } from '../../../shared/components/attachment-preview-modal/attachment-preview-modal.component';
import { detectFileType } from '../../../core/utils/code-highlight.util';

export interface MuralColorOption {
  value: string;
  name: string;
  border: string;
}

@Component({
  selector: 'app-mural-item-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatDividerModule,
    AiTextButtonComponent,
    MarkdownEditorComponent,
    MarkdownTextComponent,
    AttachmentPreviewModalComponent,
  ],
  templateUrl: './mural-item-modal.component.html',
  styleUrl: './mural-item-modal.component.scss',
})
export class MuralItemModalComponent implements OnInit {
  @ViewChild(MatMenuTrigger) contextMenuTrigger?: MatMenuTrigger;
  @Input() boardId = '';
  @Input() item: MuralItem | null = null;
  @Input() groups: MuralGroup[] = [];
  @Input() defaultGroupId: string | null = null;
  @Input() isReadOnly = false;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<MuralItem>();
  @Output() deleted = new EventEmitter<string>();

  private service = inject(MuralItemModalService);
  private attachmentsService = inject(AttachmentsService);
  private auth = inject(AuthService);
  private sanitizer = inject(DomSanitizer);

  isEdit = false;

  enableEditMode(): void {
    this.isReadOnly = false;
    this.isEdit = true;
  }
  title = '';
  content = '';
  selectedColor = '#fef08a';
  selectedGroupId: string | null = null;
  isPinned = false;
  attachments: Attachment[] = [];
  pendingFiles: File[] = [];

  getGroupName(): string | null {
    if (!this.selectedGroupId) return null;
    const group = this.groups.find(g => g.id === this.selectedGroupId);
    return group ? group.title : null;
  }

  readonly colorOptions: MuralColorOption[] = [
    { value: '#fef08a', name: 'Amarelo Clássico', border: '#facc15' },
    { value: '#bbf7d0', name: 'Menta Pastel', border: '#86efac' },
    { value: '#bae6fd', name: 'Azul Céu', border: '#7dd3fc' },
    { value: '#fbcfe8', name: 'Rosa Suave', border: '#f472b6' },
    { value: '#ddd6fe', name: 'Lavanda', border: '#a78bfa' },
    { value: '#fed7aa', name: 'Pêssego', border: '#fb923c' },
    { value: '#f1f5f9', name: 'Branco Neutro', border: '#cbd5e1' },
    { value: '#334155', name: 'Grafite Escuro', border: '#475569' },
  ];

  loadingSalvar = false;
  loadingExcluir = false;
  loadingUpload = false;
  readonly errorMessage = signal('');
  readonly confirmDelete = signal(false);

  // Context menu state (Angular Material)
  contextMenuPosition = { x: 0, y: 0 };
  contextAttachment: Attachment | null = null;
  contextPendingIndex: number | null = null;

  previewAttachmentUrl = signal<string | null>(null);
  previewAttachmentName = signal('');
  previewAttachmentMimeType = signal('');
  previewAttachmentRawContent = signal<string | null>(null);
  previewAttachmentByteSize = signal(0);
  previewCurrentAttachment = signal<Attachment | null>(null);

  get currentUserId(): string {
    return this.auth.currentUser()?.id || 'anonymous';
  }

  get currentUserName(): string {
    return this.auth.currentUser()?.name || '';
  }

  ngOnInit(): void {
    this.pendingFiles = [];
    this.errorMessage.set('');
    this.confirmDelete.set(false);
    if (this.item) {
      this.isEdit = true;
      this.title = this.item.title;
      this.content = this.item.content;
      this.selectedColor = this.item.color || '#fef08a';
      this.selectedGroupId = this.item.groupId;
      this.isPinned = this.item.isPinned;
      this.attachments = [...(this.item.attachments || [])];
    } else {
      this.isEdit = false;
      this.title = '';
      this.content = '';
      this.selectedColor = '#fef08a';
      this.selectedGroupId = this.defaultGroupId;
      this.isPinned = false;
      this.attachments = [];
    }
  }

  fechar(): void {
    this.close.emit();
  }

  salvar(): void {
    if (this.loadingSalvar || !this.title.trim()) return;

    this.errorMessage.set('');
    this.loadingSalvar = true;
    if (this.isEdit && this.item) {
      this.service.atualizarItem(this.item.id, {
        title: this.title.trim(),
        content: this.content,
        color: this.selectedColor,
        groupId: this.selectedGroupId,
        isPinned: this.isPinned,
      }, this.currentUserId).subscribe({
        next: (updated) => {
          this.uploadPendingFiles(this.item!.id, (uploadedAtts) => {
            this.loadingSalvar = false;
            this.saved.emit({ ...updated, attachments: [...this.attachments, ...uploadedAtts] });
            this.fechar();
          });
        },
        error: (err) => {
          this.loadingSalvar = false;
          this.errorMessage.set(err.error?.error || 'Erro ao salvar alterações no cartão.');
          console.error('Erro ao salvar nota do mural:', err);
        }
      });
    } else {
      const payload: MuralItemInput = {
        title: this.title.trim(),
        content: this.content,
        color: this.selectedColor,
        groupId: this.selectedGroupId,
        isPinned: this.isPinned,
        createdByName: this.currentUserName,
      };

      this.service.salvarItem(this.boardId, payload, this.currentUserId).subscribe({
        next: (created) => {
          this.uploadPendingFiles(created.id, (uploadedAtts) => {
            this.loadingSalvar = false;
            this.saved.emit({ ...created, attachments: uploadedAtts });
            this.fechar();
          });
        },
        error: (err) => {
          this.loadingSalvar = false;
          this.errorMessage.set(err.error?.error || 'Erro ao criar cartão no mural.');
          console.error('Erro ao criar nota do mural:', err);
        }
      });
    }
  }

  private uploadPendingFiles(itemId: string, callback: (atts: Attachment[]) => void): void {
    if (!this.pendingFiles.length) {
      callback([]);
      return;
    }

    const uploads$ = this.pendingFiles.map(file =>
      this.attachmentsService.upload('mural_item', itemId, file, this.currentUserId)
    );

    forkJoin(uploads$).pipe(
      finalize(() => {
        this.pendingFiles = [];
      })
    ).subscribe({
      next: (results) => {
        callback(results);
      },
      error: (err) => {
        console.error('Erro ao fazer upload de arquivos pendentes:', err);
        this.errorMessage.set(err.error?.error || 'Não foi possível enviar todos os anexos.');
        callback([]);
      }
    });
  }

  excluir(): void {
    if (!this.isEdit || !this.item || this.loadingExcluir) return;
    
    // Confirmação in-app em 2 etapas
    if (!this.confirmDelete()) {
      this.confirmDelete.set(true);
      return;
    }

    this.loadingExcluir = true;
    this.service.excluirItem(this.item.id, this.currentUserId)
      .pipe(finalize(() => { this.loadingExcluir = false; }))
      .subscribe({
        next: () => {
          this.deleted.emit(this.item!.id);
          this.fechar();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.error || 'Erro ao excluir o cartão.');
          console.error('Erro ao excluir nota:', err);
        }
      });
  }

  cancelarExclusao(): void {
    this.confirmDelete.set(false);
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (!files.length) return;

    this.errorMessage.set('');

    if (this.isEdit && this.item) {
      // Faz upload imediato dos múltiplos arquivos
      this.loadingUpload = true;
      const uploads$ = files.map(file =>
        this.attachmentsService.upload('mural_item', this.item!.id, file, this.currentUserId)
      );

      forkJoin(uploads$).pipe(
        finalize(() => {
          this.loadingUpload = false;
          input.value = '';
        })
      ).subscribe({
        next: (uploadedList) => {
          this.attachments.push(...uploadedList);
          this.saved.emit({ ...this.item!, attachments: [...this.attachments] });
        },
        error: (err) => {
          console.error('Erro ao enviar anexos:', err);
          this.errorMessage.set(err.error?.error || 'Não foi possível enviar um ou mais anexos. Verifique o limite de 10 MB por arquivo.');
        }
      });
    } else {
      // Adiciona na fila pendente para quando o item for criado
      this.pendingFiles.push(...files);
      input.value = '';
    }
  }

  removerPendingFile(index: number): void {
    this.pendingFiles.splice(index, 1);
  }

  removerAnexo(att: Attachment): void {
    this.attachmentsService.remove(att.id, this.currentUserId).subscribe({
      next: () => {
        this.attachments = this.attachments.filter(a => a.id !== att.id);
        if (this.isEdit && this.item) {
          this.saved.emit({ ...this.item, attachments: [...this.attachments] });
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.error || 'Não foi possível remover o anexo.');
        console.error('Erro ao remover anexo:', err);
      }
    });
  }

  getFileInfo(fileName: string, mimeType?: string) {
    return detectFileType(fileName, mimeType);
  }

  abrirPreview(att: Attachment): void {
    const fileInfo = detectFileType(att.fileName, att.mimeType);
    this.previewCurrentAttachment.set(att);
    this.previewAttachmentName.set(att.fileName);
    this.previewAttachmentMimeType.set(att.mimeType);
    this.previewAttachmentByteSize.set(att.byteSize);

    if (fileInfo.category === 'code' || fileInfo.category === 'other' || att.mimeType.startsWith('text/')) {
      this.attachmentsService.text(att.id, this.currentUserId).subscribe({
        next: (text) => {
          this.previewAttachmentRawContent.set(text);
          this.attachmentsService.content(att.id, this.currentUserId).subscribe({
            next: (blob) => {
              const url = URL.createObjectURL(blob);
              this.previewAttachmentUrl.set(url);
            }
          });
        },
        error: () => {
          this.attachmentsService.content(att.id, this.currentUserId).subscribe({
            next: (blob) => {
              const url = URL.createObjectURL(blob);
              this.previewAttachmentUrl.set(url);
            }
          });
        }
      });
    } else {
      this.previewAttachmentRawContent.set(null);
      this.attachmentsService.content(att.id, this.currentUserId).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          this.previewAttachmentUrl.set(url);
        }
      });
    }
  }

  abrirPendingPreview(file: File): void {
    const fileInfo = detectFileType(file.name, file.type);
    this.previewCurrentAttachment.set(null);
    this.previewAttachmentName.set(file.name);
    this.previewAttachmentMimeType.set(file.type || '');
    this.previewAttachmentByteSize.set(file.size);

    if (fileInfo.category === 'code' || file.type.startsWith('text/')) {
      file.text().then(text => {
        this.previewAttachmentRawContent.set(text);
        const url = URL.createObjectURL(file);
        this.previewAttachmentUrl.set(url);
      }).catch(() => {
        const url = URL.createObjectURL(file);
        this.previewAttachmentUrl.set(url);
      });
    } else {
      this.previewAttachmentRawContent.set(null);
      const url = URL.createObjectURL(file);
      this.previewAttachmentUrl.set(url);
    }
  }

  fecharPreview(): void {
    const current = this.previewAttachmentUrl();
    if (current) URL.revokeObjectURL(current);
    this.previewAttachmentUrl.set(null);
    this.previewAttachmentName.set('');
    this.previewAttachmentMimeType.set('');
    this.previewAttachmentRawContent.set(null);
    this.previewAttachmentByteSize.set(0);
    this.previewCurrentAttachment.set(null);
  }

  baixarAnexo(att?: Attachment | null): void {
    const target = att || this.previewCurrentAttachment();
    if (target) {
      this.attachmentsService.download(target, this.currentUserId);
    }
  }

  formatarTamanho(bytes: number): string {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  onAttachmentContextMenu(event: MouseEvent, att: Attachment): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextAttachment = att;
    this.contextPendingIndex = null;
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };
    setTimeout(() => {
      this.contextMenuTrigger?.openMenu();
    });
  }

  onPendingContextMenu(event: MouseEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextAttachment = null;
    this.contextPendingIndex = index;
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };
    setTimeout(() => {
      this.contextMenuTrigger?.openMenu();
    });
  }
}
