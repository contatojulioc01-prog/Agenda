import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
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
import { AttachmentPreviewModalComponent } from '../../../shared/components/attachment-preview-modal/attachment-preview-modal.component';
import { detectFileType } from '../../../core/utils/code-highlight.util';

@Component({
  selector: 'app-mural-board',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MuralItemModalComponent,
    MarkdownTextComponent,
    AiTextButtonComponent,
    MarkdownEditorComponent,
    AttachmentPreviewModalComponent,
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

  readonly hasPersonalBoards = computed(() => this.boards().some(b => b.scopeType === 'personal'));
  readonly hasTeamBoards = computed(() => this.boards().some(b => b.scopeType === 'team'));

  readonly search = signal('');
  readonly groupFilter = signal<string | 'all'>('all');
  readonly filterPinnedOnly = signal(false);
  readonly filterWithAttachments = signal(false);

  readonly colorPresets = [
    { label: 'Âmbar', value: '#f59e0b' },
    { label: 'Azul', value: '#0ea5e9' },
    { label: 'Índigo', value: '#4f46e5' },
    { label: 'Esmeralda', value: '#10b981' },
    { label: 'Rosa', value: '#ec4899' },
    { label: 'Vermelho', value: '#ef4444' },
    { label: 'Roxo', value: '#8b5cf6' },
    { label: 'Cinza', value: '#64748b' },
    { label: 'Turquesa', value: '#06b6d4' },
  ];

  // Modals state
  readonly itemModalOpen = signal(false);
  readonly itemModalReadOnly = signal(false);
  readonly editingItem = signal<MuralItem | null>(null);
  readonly targetGroupId = signal<string | null>(null);
  readonly muralItemContextMenu = signal<{ item: MuralItem; x: number; y: number } | null>(null);

  readonly groupModalOpen = signal(false);
  readonly editingGroup = signal<MuralGroup | null>(null);
  groupTitle = '';
  groupColor = '#64748b';

  readonly boardModalOpen = signal(false);
  boardName = '';
  boardDescription = '';
  boardColor = '#f59e0b';

  // Novo Mural modal state
  readonly createBoardModalOpen = signal(false);
  newBoardName = '';
  newBoardDescription = '';
  newBoardColor = '#f59e0b';
  newBoardScopeType: 'personal' | 'team' = 'personal';
  newBoardTeamId: string | null = null;
  loadingCriarMural = false;

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

  // In-app confirmations & alert states
  readonly confirmDeleteGroup = signal(false);
  readonly confirmDeleteBoard = signal(false);
  readonly confirmDeleteTeam = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private initializedUserId = '';
  private readonly workspaceInitialization = effect(() => {
    const user = this.auth.currentUser();
    if (!user?.id || user.id === this.initializedUserId) return;
    this.initializedUserId = user.id;
    const requestedId = this.route.snapshot.paramMap.get('boardId');
    this.muralService.loadBoards(requestedId || undefined);
    this.kanbanService.loadTeams();
  });

  private readonly activeBoardUrlSynchronization = effect(() => {
    const active = this.activeBoard();
    if (!active?.id) return;
    const currentPath = this.router.url.split('?')[0];
    if (currentPath.startsWith('/mural')) {
      const expectedUrl = `/mural/${active.id}`;
      if (currentPath !== expectedUrl) {
        void this.router.navigate(['/mural', active.id], { replaceUrl: currentPath === '/mural' });
      }
    }
  });

  readonly currentTeam = computed(() => {
    const active = this.activeBoard();
    if (!active?.teamId) return this.teams()[0] || null;
    return this.teams().find(t => t.id === active.teamId) || null;
  });

  // Attachment preview in board
  previewAttachmentUrl = signal<string | null>(null);
  previewAttachmentName = signal('');
  previewAttachmentMimeType = signal('');
  previewAttachmentRawContent = signal<string | null>(null);
  previewAttachmentByteSize = signal<number | undefined>(undefined);
  previewCurrentAttachment = signal<Attachment | null>(null);

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

  constructor() {
    this.route.paramMap.subscribe(params => {
      const boardId = params.get('boardId');
      if (boardId && this.auth.currentUser()?.id) {
        if (this.activeBoard()?.id !== boardId) {
          this.muralService.loadBoard(boardId);
        }
      }
    });
  }

  ngOnInit(): void {
    const requestedId = this.route.snapshot.paramMap.get('boardId');
    if (this.auth.currentUser()?.id) {
      this.muralService.loadBoards(requestedId || undefined);
      this.kanbanService.loadTeams();
    }

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
    void this.router.navigate(['/mural', boardId]);
    this.muralService.loadBoard(boardId);
  }

  abrirNovoItem(groupId: string | null = null): void {
    this.closeMuralItemContextMenu();
    this.itemModalReadOnly.set(false);
    this.editingItem.set(null);
    this.targetGroupId.set(groupId);
    this.itemModalOpen.set(true);
  }

  abrirVisualizarItem(item: MuralItem): void {
    this.closeMuralItemContextMenu();
    this.itemModalReadOnly.set(true);
    this.editingItem.set(item);
    this.targetGroupId.set(item.groupId);
    this.itemModalOpen.set(true);
  }

  abrirEditarItem(item: MuralItem): void {
    this.closeMuralItemContextMenu();
    this.itemModalReadOnly.set(false);
    this.editingItem.set(item);
    this.targetGroupId.set(item.groupId);
    this.itemModalOpen.set(true);
  }

  openMuralItemContextMenu(event: MouseEvent, item: MuralItem): void {
    event.preventDefault();
    event.stopPropagation();
    this.muralItemContextMenu.set({
      item,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 200)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 190)),
    });
  }

  closeMuralItemContextMenu(): void {
    this.muralItemContextMenu.set(null);
  }

  excluirItemFromContext(item: MuralItem): void {
    this.closeMuralItemContextMenu();
    this.apiService.excluirItem(item.id, this.currentUserId).subscribe({
      next: () => this.onItemExcluido(item.id),
      error: (err) => console.error('Erro ao excluir nota:', err)
    });
  }

  fecharItemModal(): void {
    this.itemModalOpen.set(false);
    this.itemModalReadOnly.set(false);
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

  onItemContentChange(item: MuralItem, newContent: string): void {
    item.content = newContent;
    this.apiService.atualizarItem(item.id, { content: newContent }, this.currentUserId).subscribe({
      next: (updated) => {
        this.onItemSalvo({ ...item, ...updated, content: newContent });
      },
      error: (err) => console.error('Erro ao atualizar checklist do cartão:', err),
    });
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
    this.confirmDeleteGroup.set(false);
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

  solicitarExclusaoGrupo(): void {
    this.confirmDeleteGroup.set(true);
  }

  solicitarExclusaoGrupoDireto(group: MuralGroup, event: MouseEvent): void {
    event.stopPropagation();
    this.editingGroup.set(group);
    this.groupTitle = group.title;
    this.groupColor = group.color;
    this.confirmDeleteGroup.set(true);
    this.groupModalOpen.set(true);
  }

  cancelarExclusaoGrupo(): void {
    this.confirmDeleteGroup.set(false);
  }

  confirmarExclusaoGrupo(): void {
    const editGroup = this.editingGroup();
    if (!editGroup || this.loadingExcluirGrupo) return;

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

  isFirstGroup(group: MuralGroup): boolean {
    const groups = this.activeBoard()?.groups || [];
    return groups.length > 0 && groups[0].id === group.id;
  }

  isLastGroup(group: MuralGroup): boolean {
    const groups = this.activeBoard()?.groups || [];
    return groups.length > 0 && groups[groups.length - 1].id === group.id;
  }

  onGroupDropped(event: CdkDragDrop<MuralGroup[]>): void {
    const active = this.activeBoard();
    if (!active || !active.groups || event.previousIndex === event.currentIndex) return;
    const updatedGroups = [...active.groups];
    moveItemInArray(updatedGroups, event.previousIndex, event.currentIndex);
    updatedGroups.forEach((grp, idx) => { grp.position = idx; });
    this.activeBoard.update(curr => curr ? { ...curr, groups: updatedGroups } : null);

    const groupIds = updatedGroups.map(g => g.id);
    this.apiService.reordenarGrupos(active.id, groupIds, this.currentUserId).subscribe({
      error: (err) => console.error('Erro ao reordenar grupos:', err)
    });
  }

  moverGrupo(group: MuralGroup, delta: number, event?: Event): void {
    event?.stopPropagation();
    const active = this.activeBoard();
    if (!active || !active.groups) return;
    const index = active.groups.findIndex(g => g.id === group.id);
    if (index === -1) return;
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= active.groups.length) return;

    const updatedGroups = [...active.groups];
    moveItemInArray(updatedGroups, index, newIndex);
    updatedGroups.forEach((grp, idx) => { grp.position = idx; });
    this.activeBoard.update(curr => curr ? { ...curr, groups: updatedGroups } : null);

    const groupIds = updatedGroups.map(g => g.id);
    this.apiService.reordenarGrupos(active.id, groupIds, this.currentUserId).subscribe({
      error: (err) => console.error('Erro ao reordenar grupos:', err)
    });
  }

  onBoardDropped(event: CdkDragDrop<MuralBoardSummary[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const allBoards = [...this.boards()];
    moveItemInArray(allBoards, event.previousIndex, event.currentIndex);
    allBoards.forEach((b, idx) => { b.position = idx; });
    this.boards.set(allBoards);

    const boardIds = allBoards.map(b => b.id);
    this.apiService.reordenarMurais(boardIds, this.currentUserId).subscribe({
      error: (err) => console.error('Erro ao reordenar murais:', err)
    });
  }

  // Board modal management
  abrirNovoMural(scopeType: 'personal' | 'team' = 'personal', teamId: string | null = null): void {
    this.newBoardName = '';
    this.newBoardDescription = '';
    this.newBoardColor = '#f59e0b';
    this.newBoardScopeType = scopeType;
    this.newBoardTeamId = teamId;
    this.createBoardModalOpen.set(true);
  }

  fecharNovoMuralModal(): void {
    this.createBoardModalOpen.set(false);
  }

  salvarNovoMural(): void {
    if (!this.newBoardName.trim() || this.loadingCriarMural) return;

    this.loadingCriarMural = true;
    this.apiService.salvarMural({
      name: this.newBoardName.trim(),
      description: this.newBoardDescription,
      color: this.newBoardColor,
      scopeType: this.newBoardScopeType,
      teamId: this.newBoardTeamId,
    }, this.currentUserId)
      .pipe(finalize(() => { this.loadingCriarMural = false; }))
      .subscribe({
        next: (created) => {
          this.boards.update(list => [...list, created]);
          this.fecharNovoMuralModal();
          this.selecionarMural(created.id);
        },
        error: (err) => console.error('Erro ao criar mural:', err)
      });
  }

  abrirEditarMural(): void {
    const active = this.activeBoard();
    if (!active) return;
    this.boardName = active.name;
    this.boardDescription = active.description;
    this.boardColor = active.color;
    this.confirmDeleteBoard.set(false);
    this.boardModalOpen.set(true);
  }

  fecharBoardModal(): void {
    this.boardModalOpen.set(false);
    this.confirmDeleteBoard.set(false);
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

  solicitarExclusaoMural(): void {
    this.confirmDeleteBoard.set(true);
  }

  cancelarExclusaoMural(): void {
    this.confirmDeleteBoard.set(false);
  }

  confirmarExclusaoMural(): void {
    const active = this.activeBoard();
    if (!active || this.loadingExcluirMural) return;

    this.loadingExcluirMural = true;
    this.apiService.excluirMural(active.id, this.currentUserId)
      .pipe(finalize(() => { this.loadingExcluirMural = false; }))
      .subscribe({
        next: () => {
          const remaining = this.boards().filter(b => b.id !== active.id);
          this.boards.set(remaining);
          this.confirmDeleteBoard.set(false);
          this.fecharBoardModal();
          if (remaining.length) {
            this.selecionarMural(remaining[0].id);
          } else {
            this.muralService.loadBoards();
          }
        },
        error: (err) => console.error('Erro ao excluir mural:', err)
      });
  }

  excluirMuralPorId(board: MuralBoardSummary, event?: Event): void {
    event?.stopPropagation();
    if (!confirm(`Deseja excluir o mural "${board.name}" e todas as suas notas? Esta ação não pode ser desfeita.`)) return;

    this.apiService.excluirMural(board.id, this.currentUserId).subscribe({
      next: () => {
        const remaining = this.boards().filter(b => b.id !== board.id);
        this.boards.set(remaining);
        if (this.activeBoard()?.id === board.id) {
          if (remaining.length) {
            this.selecionarMural(remaining[0].id);
          } else {
            this.muralService.loadBoards();
          }
        }
      },
      error: (err) => console.error('Erro ao excluir mural:', err)
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
    this.confirmDeleteTeam.set(false);
  }

  trocarTimeNoModal(teamId: string): void {
    this.confirmDeleteTeam.set(false);
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

  changeMemberRole(memberId: string, role: 'admin' | 'member'): void {
    const team = this.currentTeam();
    if (!team) return;
    this.kanbanService.changeTeamMemberRole(team.id, memberId, role);
  }

  isTeamOwner(userId: string): boolean {
    return this.currentTeam()?.owner_id === userId;
  }

  solicitarExclusaoTime(): void {
    this.confirmDeleteTeam.set(true);
  }

  cancelarExclusaoTime(): void {
    this.confirmDeleteTeam.set(false);
  }

  confirmarExclusaoTime(): void {
    const team = this.currentTeam();
    if (!team) return;
    this.kanbanService.deleteTeam(team.id, (success) => {
      if (success) {
        this.confirmDeleteTeam.set(false);
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

  getFileInfo(name: string, mime?: string) {
    return detectFileType(name, mime);
  }

  // Attachment preview in board
  abrirPreview(event: MouseEvent, att: Attachment): void {
    event.stopPropagation();
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
        },
        error: (err) => console.error('Erro ao carregar preview do anexo:', err)
      });
    }
  }

  fecharPreview(): void {
    const current = this.previewAttachmentUrl();
    if (current) URL.revokeObjectURL(current);
    this.previewAttachmentUrl.set(null);
    this.previewAttachmentName.set('');
    this.previewAttachmentMimeType.set('');
    this.previewAttachmentRawContent.set(null);
    this.previewAttachmentByteSize.set(undefined);
    this.previewCurrentAttachment.set(null);
  }

  baixarAnexo(att?: Attachment | null): void {
    const target = att || this.previewCurrentAttachment();
    if (!target) return;
    this.attachmentsService.content(target.id, this.currentUserId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = target.fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
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
}
