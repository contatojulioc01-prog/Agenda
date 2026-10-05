import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { finalize } from 'rxjs';

import { MuralBoard, MuralBoardSummary, MuralGroup, MuralItem } from '../../../core/models/mural.model';
import { Attachment } from '../../../core/models/attachment.model';
import { KanbanTeam, KanbanTeamMember } from '../../../core/models/kanban.model';
import { DEFAULT_AVATAR } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';
import { MuralService } from '../../../core/services/mural.service';
import { KanbanService } from '../../../core/services/kanban.service';
import { AttachmentsService } from '../../../core/services/attachments.service';
import { SyncService } from '../../../core/services/sync.service';
import { MuralBoardApiService } from './mural-board.service';
import { MuralItemModalComponent } from '../mural-item-modal/mural-item-modal.component';
import { MarkdownTextComponent } from '../../../shared/components/markdown-text/markdown-text.component';
import { AiTextButtonComponent } from '../../../shared/components/ai-text-button/ai-text-button.component';
import { MarkdownEditorComponent } from '../../../shared/components/markdown-editor/markdown-editor.component';

@Component({
  selector: 'app-mural-board',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MuralItemModalComponent,
    MarkdownTextComponent,
    AiTextButtonComponent,
    MarkdownEditorComponent,
  ],
  templateUrl: './mural-board.component.html',
  styleUrl: './mural-board.component.scss',
})
export class MuralBoardComponent implements OnInit, OnDestroy {
  readonly muralService = inject(MuralService);
  readonly kanbanService = inject(KanbanService);
  readonly auth = inject(AuthService);
  private apiService = inject(MuralBoardApiService);
  private attachmentsService = inject(AttachmentsService);
  private syncService = inject(SyncService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);

  readonly defaultAvatar = DEFAULT_AVATAR;
  readonly boards = this.muralService.boards;
  readonly activeBoard = this.muralService.activeBoard;
  readonly loading = this.muralService.loading;
  readonly teams = this.kanbanService.teams;

  readonly search = signal('');
  readonly groupFilter = signal<string | 'all'>('all');
  readonly filterPinnedOnly = signal(false);
  readonly filterWithAttachments = signal(false);

  // Modals state
  readonly itemModalOpen = signal(false);
  readonly editingItem = signal<MuralItem | null>(null);
  readonly targetGroupId = signal<string | null>(null);

  readonly groupModalOpen = signal(false);
  readonly editingGroup = signal<MuralGroup | null>(null);
  groupTitle = '';
  groupColor = '#64748b';

  readonly boardModalOpen = signal(false);
  boardName = '';
  boardDescription = '';
  boardColor = '#f59e0b';

  // HTTP loading variables
  loadingSalvarGrupo = false;
  loadingExcluirGrupo = false;
  loadingSalvarMural = false;
  loadingExcluirMural = false;

  // Drag & Drop state
  draggingItemId: string | null = null;
  private draggingItem: MuralItem | null = null;
  dragOverGroupId: string | null = null;

  // Team modal state (Exato ao Tarefas)
  readonly teamModalOpen = signal(false);
  readonly creatingTeam = signal(false);
  newTeamName = '';
  newTeamDescription = '';
  newTeamColor = '#4f46e5';
  invitedUserId = '';

  readonly inviteableUsers = computed(() => [...this.auth.allUsers()].sort((first, second) =>
    (first.name || first.email || '').localeCompare(second.name || second.email || '', 'pt-BR', { sensitivity: 'base' })
  ));

  readonly currentTeam = computed(() => {
    const active = this.activeBoard();
    if (!active?.teamId) return this.teams()[0] || null;
    return this.teams().find(t => t.id === active.teamId) || null;
  });

  // Attachment preview in board
  previewAttachmentUrl = signal<string | null>(null);
  previewAttachmentName = signal('');
  previewAttachmentMimeType = signal('');
  trustedPreviewUrl = signal<SafeResourceUrl | null>(null);

  private unsubscribeRealtime?: () => void;

  get currentUserId(): string {
    return this.auth.currentUser()?.id || 'anonymous';
  }

  // Filtered Items computed
  readonly filteredItems = computed(() => {
    const board = this.activeBoard();
    if (!board) return [];

    const query = this.search().trim().toLowerCase();
    const gFilter = this.groupFilter();
    const pinnedOnly = this.filterPinnedOnly();
    const withAtts = this.filterWithAttachments();

    return board.items.filter(item => {
      if (query && !item.title.toLowerCase().includes(query) && !item.content.toLowerCase().includes(query)) {
        return false;
      }
      if (gFilter !== 'all') {
        if (gFilter === 'ungrouped' && item.groupId !== null) return false;
        if (gFilter !== 'ungrouped' && item.groupId !== gFilter) return false;
      }
      if (pinnedOnly && !item.isPinned) return false;
      if (withAtts && (!item.attachments || item.attachments.length === 0)) return false;
      return true;
    });
  });

  // Grouped items mapping
  readonly itemsByGroup = computed(() => {
    const items = this.filteredItems();
    const map = new Map<string, MuralItem[]>();
    for (const item of items) {
      const key = item.groupId || 'ungrouped';
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  });

  readonly ungroupedItems = computed(() => {
    return this.itemsByGroup().get('ungrouped') || [];
  });

  ngOnInit(): void {
    const requestedId = this.route.snapshot.paramMap.get('boardId');
    this.muralService.loadBoards(requestedId || undefined);
    this.kanbanService.loadTeams();

    this.unsubscribeRealtime = this.syncService.subscribe(event => {
      if (event.type === 'mural_updated') {
        const active = this.activeBoard();
        if (active && active.id === event.muralId) {
          this.muralService.loadBoard(active.id);
        } else {
          this.muralService.loadBoards();
        }
      } else if (event.type === 'mural_deleted') {
        this.muralService.loadBoards();
      }
    });
  }

  ngOnDestroy(): void {
    this.unsubscribeRealtime?.();
    this.fecharPreview();
  }

  selecionarMural(boardId: string): void {
    this.muralService.loadBoard(boardId);
  }

  abrirNovoItem(groupId: string | null = null): void {
    this.editingItem.set(null);
    this.targetGroupId.set(groupId);
    this.itemModalOpen.set(true);
  }

  abrirEditarItem(item: MuralItem): void {
    this.editingItem.set(item);
    this.targetGroupId.set(item.groupId);
    this.itemModalOpen.set(true);
  }

  fecharItemModal(): void {
    this.itemModalOpen.set(false);
    this.editingItem.set(null);
    this.targetGroupId.set(null);
  }

  onItemSalvo(savedItem: MuralItem): void {
    const active = this.activeBoard();
    if (!active) return;
    const exists = active.items.some(i => i.id === savedItem.id);
    if (exists) {
      this.activeBoard.update(curr => curr ? {
        ...curr,
        items: curr.items.map(i => i.id === savedItem.id ? savedItem : i)
      } : null);
    } else {
      this.activeBoard.update(curr => curr ? {
        ...curr,
        items: [savedItem, ...curr.items]
      } : null);
    }
  }

  onItemExcluido(itemId: string): void {
    this.activeBoard.update(curr => curr ? {
      ...curr,
      items: curr.items.filter(i => i.id !== itemId)
    } : null);
  }

  alternarFixacao(event: MouseEvent, item: MuralItem): void {
    event.stopPropagation();
    const novoEstado = !item.isPinned;
    this.apiService.alternarFixacao(item.id, novoEstado, this.currentUserId).subscribe({
      next: (updated) => {
        this.activeBoard.update(curr => curr ? {
          ...curr,
          items: curr.items.map(i => i.id === item.id ? { ...i, isPinned: novoEstado } : i)
        } : null);
      },
      error: (err) => {
        console.error('Erro ao alternar fixação:', err);
      }
    });
  }

  // Group modal management
  abrirNovoGrupo(): void {
    this.editingGroup.set(null);
    this.groupTitle = '';
    this.groupColor = '#64748b';
    this.groupModalOpen.set(true);
  }

  abrirEditarGrupo(group: MuralGroup, event: MouseEvent): void {
    event.stopPropagation();
    this.editingGroup.set(group);
    this.groupTitle = group.title;
    this.groupColor = group.color;
    this.groupModalOpen.set(true);
  }

  fecharGrupoModal(): void {
    this.groupModalOpen.set(false);
    this.editingGroup.set(null);
  }

  salvarGrupo(): void {
    const active = this.activeBoard();
    if (!active || this.loadingSalvarGrupo || !this.groupTitle.trim()) return;

    this.loadingSalvarGrupo = true;
    const editGroup = this.editingGroup();

    if (editGroup) {
      this.apiService.atualizarGrupo(editGroup.id, {
        title: this.groupTitle.trim(),
        color: this.groupColor,
      }, this.currentUserId)
        .pipe(finalize(() => { this.loadingSalvarGrupo = false; }))
        .subscribe({
          next: (updated) => {
            this.activeBoard.update(curr => curr ? {
              ...curr,
              groups: curr.groups.map(g => g.id === editGroup.id ? updated : g)
            } : null);
            this.fecharGrupoModal();
          },
          error: (err) => console.error('Erro ao atualizar grupo:', err)
        });
    } else {
      this.apiService.salvarGrupo(active.id, {
        title: this.groupTitle.trim(),
        color: this.groupColor,
      }, this.currentUserId)
        .pipe(finalize(() => { this.loadingSalvarGrupo = false; }))
        .subscribe({
          next: (created) => {
            this.activeBoard.update(curr => curr ? {
              ...curr,
              groups: [...curr.groups, created]
            } : null);
            this.fecharGrupoModal();
          },
          error: (err) => console.error('Erro ao criar grupo:', err)
        });
    }
  }

  excluirGrupo(): void {
    const editGroup = this.editingGroup();
    if (!editGroup || this.loadingExcluirGrupo) return;
    if (!confirm(`Deseja excluir o grupo "${editGroup.title}"? As notas serão movidas para notas soltas.`)) return;

    this.loadingExcluirGrupo = true;
    this.apiService.excluirGrupo(editGroup.id, this.currentUserId)
      .pipe(finalize(() => { this.loadingExcluirGrupo = false; }))
      .subscribe({
        next: () => {
          this.activeBoard.update(curr => curr ? {
            ...curr,
            groups: curr.groups.filter(g => g.id !== editGroup.id),
            items: curr.items.map(i => i.groupId === editGroup.id ? { ...i, groupId: null } : i)
          } : null);
          this.fecharGrupoModal();
        },
        error: (err) => console.error('Erro ao excluir grupo:', err)
      });
  }

  // Board modal management
  abrirEditarMural(): void {
    const active = this.activeBoard();
    if (!active) return;
    this.boardName = active.name;
    this.boardDescription = active.description;
    this.boardColor = active.color;
    this.boardModalOpen.set(true);
  }

  fecharBoardModal(): void {
    this.boardModalOpen.set(false);
  }

  salvarMural(): void {
    const active = this.activeBoard();
    if (!active || this.loadingSalvarMural || !this.boardName.trim()) return;

    this.loadingSalvarMural = true;
    this.apiService.atualizarMural(active.id, {
      name: this.boardName.trim(),
      description: this.boardDescription,
      color: this.boardColor,
    }, this.currentUserId)
      .pipe(finalize(() => { this.loadingSalvarMural = false; }))
      .subscribe({
        next: (updated) => {
          this.activeBoard.update(curr => curr ? { ...curr, ...updated } : null);
          this.boards.update(list => list.map(b => b.id === active.id ? { ...b, ...updated } : b));
          this.fecharBoardModal();
        },
        error: (err) => console.error('Erro ao atualizar mural:', err)
      });
  }

  // ══ Drag & Drop ══
  onDragStart(event: DragEvent, item: MuralItem): void {
    this.draggingItem = item;
    this.draggingItemId = item.id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
    }
  }

  onDragEnd(): void {
    this.draggingItemId = null;
    this.draggingItem = null;
    this.dragOverGroupId = null;
  }

  onGroupDragOver(event: DragEvent, groupId: string): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverGroupId = groupId;
  }

  onGroupDragLeave(): void {
    this.dragOverGroupId = null;
  }

  onDropInGroup(event: DragEvent, groupId: string | null): void {
    event.preventDefault();
    this.dragOverGroupId = null;
    const item = this.draggingItem;
    if (!item || item.groupId === groupId) return;

    // Optimistic update
    this.activeBoard.update(curr => curr ? {
      ...curr,
      items: curr.items.map(i => i.id === item.id ? { ...i, groupId } : i)
    } : null);

    // Persist
    this.apiService.moverItemParaGrupo(item.id, groupId, this.currentUserId).subscribe({
      error: (err) => {
        console.error('Erro ao mover item:', err);
        // Rollback
        this.activeBoard.update(curr => curr ? {
          ...curr,
          items: curr.items.map(i => i.id === item.id ? { ...i, groupId: item.groupId } : i)
        } : null);
      }
    });

    this.draggingItem = null;
    this.draggingItemId = null;
  }

  // ══ Team Management (Exato ao Tarefas) ══
  abrirCriarTime(): void {
    this.newTeamName = '';
    this.newTeamDescription = '';
    this.newTeamColor = '#4f46e5';
    this.creatingTeam.set(true);
    this.teamModalOpen.set(true);
  }

  abrirGerenciarTime(teamId?: string): void {
    const targetTeamId = teamId || this.activeBoard()?.teamId || this.teams()[0]?.id;
    if (targetTeamId) {
      this.kanbanService.loadTeamMembers(targetTeamId);
    }
    this.creatingTeam.set(false);
    this.invitedUserId = '';
    this.teamModalOpen.set(true);
  }

  fecharTimeModal(): void {
    this.teamModalOpen.set(false);
  }

  trocarTimeNoModal(teamId: string): void {
    this.kanbanService.loadTeamMembers(teamId);
    const targetMural = this.boards().find(b => b.teamId === teamId);
    if (targetMural) {
      this.muralService.loadBoard(targetMural.id);
    }
  }

  saveTeam(): void {
    const name = this.newTeamName.trim();
    if (name) {
      this.kanbanService.createTeam(name, this.newTeamDescription.trim(), this.newTeamColor);
      setTimeout(() => {
        this.muralService.loadBoards();
      }, 500);
    }
    this.newTeamName = '';
    this.newTeamDescription = '';
    this.creatingTeam.set(false);
    this.teamModalOpen.set(false);
  }

  inviteMember(): void {
    const team = this.currentTeam();
    if (!team || !this.invitedUserId) return;
    this.kanbanService.inviteToTeam(team.id, this.invitedUserId);
    this.invitedUserId = '';
  }

  removeMember(memberId: string): void {
    const team = this.currentTeam();
    if (!team) return;
    this.kanbanService.removeTeamMember(team.id, memberId);
  }

  removeTeam(): void {
    const team = this.currentTeam();
    if (!team) return;
    if (!confirm(`Deseja realmente excluir o time "${team.name}"?`)) return;
    this.kanbanService.deleteTeam(team.id, (success) => {
      if (success) {
        this.teamModalOpen.set(false);
        this.muralService.loadBoards();
      }
    });
  }

  memberName(userId: string): string {
    if (userId === this.auth.currentUser()?.id) return this.auth.currentUser()?.name || 'Você';
    return this.auth.allUsers().find(user => user.id === userId)?.name || userId;
  }

  memberAvatar(userId: string): string {
    if (userId === this.auth.currentUser()?.id) return this.auth.currentUser()?.avatar || this.defaultAvatar;
    return this.auth.allUsers().find(user => user.id === userId)?.avatar || this.defaultAvatar;
  }

  // Attachment preview in board
  abrirPreview(event: MouseEvent, att: Attachment): void {
    event.stopPropagation();
    this.attachmentsService.content(att.id, this.currentUserId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.previewAttachmentUrl.set(url);
        this.previewAttachmentName.set(att.fileName);
        this.previewAttachmentMimeType.set(att.mimeType);
        this.trustedPreviewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
      },
      error: (err) => console.error('Erro ao carregar preview do anexo:', err)
    });
  }

  fecharPreview(): void {
    const current = this.previewAttachmentUrl();
    if (current) URL.revokeObjectURL(current);
    this.previewAttachmentUrl.set(null);
    this.previewAttachmentName.set('');
    this.previewAttachmentMimeType.set('');
    this.trustedPreviewUrl.set(null);
  }

  formatarData(isoString: string): string {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const dia = d.getDate().toString().padStart(2, '0');
      const mes = (d.getMonth() + 1).toString().padStart(2, '0');
      const hora = d.getHours().toString().padStart(2, '0');
      const min = d.getMinutes().toString().padStart(2, '0');
      return `${dia}/${mes} às ${hora}:${min}`;
    } catch {
      return isoString;
    }
  }

  pegarPrimeiraImagem(item: MuralItem): Attachment | null {
    if (!item.attachments || !item.attachments.length) return null;
    return item.attachments.find(a => a.mimeType.startsWith('image/')) || null;
  }
}
