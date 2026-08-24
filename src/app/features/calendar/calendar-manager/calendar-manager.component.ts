import {
  Component, Input, Output, EventEmitter, inject, signal, computed, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Calendar, CalendarMember, CalendarPermission, CALENDAR_COLORS } from '../../../core/models/calendar.model';
import { CalendarsService } from '../../../core/services/calendars.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserResponse, DEFAULT_AVATAR } from '../../../core/models/user.model';

@Component({
  selector: 'app-calendar-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './calendar-manager.component.html',
  styleUrl: './calendar-manager.component.scss',
})
export class CalendarManagerComponent implements OnInit {
  public calendarsService = inject(CalendarsService);
  public authService = inject(AuthService);

  readonly defaultAvatar = DEFAULT_AVATAR;

  /** null = criando nova, Calendar = editando existente */
  @Input() calendar: Calendar | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly COLORS = CALENDAR_COLORS;
  readonly allUsers = this.authService.allUsers;
  readonly currentUser = this.authService.currentUser;

  // Form state
  name = signal('');
  selectedColor = '#4f46e5';
  isPrivate = true;

  // Dropdowns
  showMemberDropdown = false;
  userSearch = signal('');
  isSaving = false;
  showDeleteConfirmation = false;

  // Membros adicionados
  members = signal<(CalendarMember & { userName?: string; userEmail?: string })[]>([]);

  get isEditing(): boolean { return !!this.calendar; }
  get isOwner(): boolean { return !!this.calendar && this.calendarsService.isOwner(this.calendar.id); }
  get canDelete(): boolean { return this.isOwner && !this.calendar?.isDefault; }

  /** Lista de colaboradores disponíveis (excluindo já adicionados e o próprio usuário logado) */
  readonly availableUsers = computed<UserResponse[]>(() => {
    const users = this.allUsers();
    const currentId = this.currentUser()?.id;
    const addedIds = new Set(this.members().map(m => m.user_id));

    return users.filter(u => u.id !== currentId && !addedIds.has(u.id));
  });

  /** Usuários filtrados para o campo de busca de membros (atualiza em tempo real) */
  readonly filteredUsers = computed<UserResponse[]>(() => {
    const q = this.userSearch().toLowerCase().trim();
    const available = this.availableUsers();

    if (!q) return available.slice(0, 15);
    return available.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.departament?.name || '').toLowerCase().includes(q)
    ).slice(0, 15);
  });

  ngOnInit(): void {
    if (this.calendar) {
      this.name.set(this.calendar.name);
      this.selectedColor = this.calendar.color;
      this.isPrivate = this.calendar.isPrivate;

      const allU = this.allUsers();
      this.members.set(
        this.calendar.members
          .filter(m => m.permission !== 'owner')
          .map(m => {
            const user = allU.find(u => u.id === m.user_id);
            return { ...m, userName: user?.name, userEmail: user?.email };
          })
      );
    }
  }

  /* ── Campo de busca de membros ── */
  onMemberSearchFocus(): void {
    this.showMemberDropdown = true;
  }

  onMemberSearchChange(): void {
    this.showMemberDropdown = true;
  }

  onMemberSearchBlur(): void {
    setTimeout(() => {
      this.showMemberDropdown = false;
    }, 250);
  }

  addMember(user: UserResponse): void {
    this.members.update(list => [...list, {
      id: '',
      calendar_id: this.calendar?.id ?? '',
      user_id: user.id,
      permission: 'editor',
      userName: user.name,
      userEmail: user.email,
    }]);
    this.userSearch.set('');
  }

  updatePermission(userId: string, permission: CalendarPermission): void {
    this.members.update(list =>
      list.map(m => m.user_id === userId ? { ...m, permission } : m)
    );
  }

  removeMember(userId: string): void {
    this.members.update(list => list.filter(m => m.user_id !== userId));
  }

  onSave(): void {
    const val = this.name().trim();
    if (!val) return;
    this.isSaving = true;

    if (this.isEditing && this.calendar) {
      const existing = this.calendar.members.filter(m => m.permission !== 'owner');
      const current = this.isOwner ? (this.isPrivate ? [] : this.members()) : existing;

      const toAdd = current.filter(m => !existing.some(e => e.user_id === m.user_id));
      const toRemove = existing.filter(e => !current.some(m => m.user_id === e.user_id));
      const toUpdate = current.filter(m => {
        const e = existing.find(ex => ex.user_id === m.user_id);
        return e && e.permission !== m.permission;
      });
      const operations: Array<(done: (success: boolean) => void) => void> = [
        done => this.calendarsService.update(this.calendar!.id, { name: val, color: this.selectedColor, isPrivate: this.isPrivate }, done),
        ...toAdd.map(m => (done: (success: boolean) => void) => this.calendarsService.addMember(this.calendar!.id, m.user_id, m.permission, done)),
        ...toRemove.map(m => (done: (success: boolean) => void) => this.calendarsService.removeMember(this.calendar!.id, m.id, done)),
        ...toUpdate.map(m => (done: (success: boolean) => void) => {
          const existingMember = existing.find(item => item.user_id === m.user_id)!;
          this.calendarsService.updateMemberPermission(this.calendar!.id, existingMember.id, m.permission, done);
        }),
      ];
      let pending = operations.length;
      let succeeded = true;
      operations.forEach(operation => operation(success => {
        succeeded = succeeded && success;
        if (--pending === 0) this.finishSave(succeeded);
      }));
    } else {
      const initialMembers = (this.isPrivate ? [] : this.members()).map(m => ({
        user_id: m.user_id,
        permission: m.permission,
      }));
      this.calendarsService.create(val, this.selectedColor, this.isPrivate, initialMembers, success => this.finishSave(success));
    }
  }

  onDelete(): void {
    if (!this.calendar) return;
    this.showDeleteConfirmation = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirmation = false;
  }

  confirmDelete(): void {
    if (!this.calendar) return;
    this.showDeleteConfirmation = false;
    this.isSaving = true;
    this.calendarsService.remove(this.calendar.id, success => {
      this.isSaving = false;
      if (success) {
        this.saved.emit();
        this.closed.emit();
      }
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  permissionLabel(p: CalendarPermission): string {
    return p === 'editor' ? 'Leitura e Gravação' : 'Somente Leitura';
  }

  private finishSave(success: boolean): void {
    this.isSaving = false;
    if (!success) return;
    this.saved.emit();
    this.closed.emit();
  }
}
