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
import { UserResponse } from '../../../core/models/user.model';

export interface NameSuggestion {
  title: string;
  subtitle: string;
  user?: UserResponse;
  dept?: string;
  avatar?: string;
}

@Component({
  selector: 'app-calendar-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './calendar-manager.component.html',
  styleUrl: './calendar-manager.component.scss',
})
export class CalendarManagerComponent implements OnInit {
  private calendarsService = inject(CalendarsService);
  public authService = inject(AuthService);

  /** null = criando nova, Calendar = editando existente */
  @Input() calendar: Calendar | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly COLORS = CALENDAR_COLORS;
  readonly allUsers = this.authService.allUsers;
  readonly currentUser = this.authService.currentUser;

  // Form state
  name = '';
  selectedColor = '#4f46e5';
  isPrivate = false;

  // Dropdowns
  showNameDropdown = false;
  showMemberDropdown = false;
  userSearch = '';
  isSaving = false;

  // Membros adicionados
  members = signal<(CalendarMember & { userName?: string; userEmail?: string })[]>([]);

  get isEditing(): boolean { return !!this.calendar; }

  /** Lista de colaboradores disponíveis (excluindo já adicionados e o próprio usuário logado) */
  readonly availableUsers = computed<UserResponse[]>(() => {
    const users = this.allUsers();
    const currentId = this.currentUser()?.id;
    const addedIds = new Set(this.members().map(m => m.user_id));

    return users.filter(u => u.id !== currentId && !addedIds.has(u.id));
  });

  /** Usuários filtrados para o campo de busca de membros */
  readonly filteredUsers = computed<UserResponse[]>(() => {
    const q = this.userSearch.toLowerCase().trim();
    const available = this.availableUsers();

    if (!q) return available.slice(0, 15);
    return available.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.departament?.name || '').toLowerCase().includes(q)
    ).slice(0, 15);
  });

  /** Sugestões automáticas no campo "Nome da Agenda" */
  readonly nameSuggestions = computed<NameSuggestion[]>(() => {
    const q = this.name.toLowerCase().trim();
    const users = this.allUsers();
    const suggestions: NameSuggestion[] = [];

    // Sugestões por colaborador
    users.forEach(u => {
      if (!q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)) {
        suggestions.push({
          title: `Agenda de ${u.name}`,
          subtitle: `${u.departament?.name || 'Colaborador'} · ${u.email}`,
          user: u,
          avatar: u.avatar,
        });
      }
    });

    // Sugestões por setor / departamento
    const depts = Array.from(new Set(users.map(u => u.departament?.name).filter(Boolean))) as string[];
    depts.forEach(d => {
      if (!q || d.toLowerCase().includes(q)) {
        suggestions.push({
          title: `Equipe ${d}`,
          subtitle: `Departamento ${d}`,
          dept: d,
        });
      }
    });

    return suggestions.slice(0, 10);
  });

  ngOnInit(): void {
    if (this.calendar) {
      this.name = this.calendar.name;
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

  /* ── Sugestões no campo de Nome ── */
  onNameFocus(): void {
    this.showNameDropdown = true;
  }

  onNameChange(): void {
    this.showNameDropdown = true;
  }

  onNameBlur(): void {
    setTimeout(() => {
      this.showNameDropdown = false;
    }, 250);
  }

  selectNameSuggestion(sug: NameSuggestion): void {
    this.name = sug.title;
    this.showNameDropdown = false;

    if (sug.user && !this.members().some(m => m.user_id === sug.user!.id)) {
      this.addMember(sug.user);
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
    this.userSearch = '';
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
    if (!this.name.trim()) return;
    this.isSaving = true;

    if (this.isEditing && this.calendar) {
      this.calendarsService.update(this.calendar.id, {
        name: this.name.trim(),
        color: this.selectedColor,
        isPrivate: this.isPrivate,
      });

      const existing = this.calendar.members.filter(m => m.permission !== 'owner');
      const current = this.members();

      const toAdd = current.filter(m => !existing.some(e => e.user_id === m.user_id));
      toAdd.forEach(m => this.calendarsService.addMember(this.calendar!.id, m.user_id, m.permission));

      const toRemove = existing.filter(e => !current.some(m => m.user_id === e.user_id));
      toRemove.forEach(m => this.calendarsService.removeMember(this.calendar!.id, m.id));

      const toUpdate = current.filter(m => {
        const e = existing.find(ex => ex.user_id === m.user_id);
        return e && e.permission !== m.permission;
      });
      toUpdate.forEach(m => {
        const e = existing.find(ex => ex.user_id === m.user_id)!;
        this.calendarsService.updateMemberPermission(this.calendar!.id, e.id, m.permission);
      });
    } else {
      this.calendarsService.create(this.name.trim(), this.selectedColor, this.isPrivate);
    }

    setTimeout(() => {
      this.isSaving = false;
      this.saved.emit();
      this.closed.emit();
    }, 500);
  }

  onClose(): void {
    this.closed.emit();
  }

  permissionLabel(p: CalendarPermission): string {
    return p === 'editor' ? 'Leitura e Gravação' : 'Somente Leitura';
  }
}
