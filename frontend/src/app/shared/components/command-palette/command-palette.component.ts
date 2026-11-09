import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  computed,
  signal,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CalendarEvent } from '../../../core/models/event.model';
import { KanbanTask } from '../../../core/models/kanban.model';
import { MuralItem } from '../../../core/models/mural.model';
import { ThemeService } from '../../../core/services/theme.service';

export type CommandItemType = 'event' | 'task' | 'mural' | 'action';

export interface CommandItem {
  id: string;
  type: CommandItemType;
  title: string;
  subtitle?: string;
  icon: string;
  color?: string;
  badge?: string;
  data?: any;
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss',
})
export class CommandPaletteComponent {
  private themeService = inject(ThemeService);

  @Input() events: CalendarEvent[] = [];
  @Input() tasks: KanbanTask[] = [];
  @Input() muralItems: MuralItem[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() selectEvent = new EventEmitter<CalendarEvent>();
  @Output() selectTask = new EventEmitter<KanbanTask>();
  @Output() selectMuralItem = new EventEmitter<MuralItem>();
  @Output() triggerAction = new EventEmitter<string>();

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  query = signal('');
  selectedIndex = signal(0);
  selectedCategory = signal<'all' | 'event' | 'task' | 'mural' | 'action'>('all');

  readonly systemActions: CommandItem[] = [
    { id: 'act-new-event', type: 'action', title: 'Criar novo evento na Agenda', subtitle: 'Atalho rápido de calendário', icon: 'event', badge: 'Ação' },
    { id: 'act-new-task', type: 'action', title: 'Criar nova tarefa no Kanban', subtitle: 'Atalho rápido de tarefas', icon: 'add_task', badge: 'Ação' },
    { id: 'act-new-mural', type: 'action', title: 'Criar novo cartão no Mural', subtitle: 'Atalho rápido de avisos', icon: 'post_add', badge: 'Ação' },
    { id: 'act-go-today', type: 'action', title: 'Ir para a data de Hoje', subtitle: 'Centraliza a agenda no dia atual', icon: 'today', badge: 'Navegação' },
    { id: 'act-toggle-theme', type: 'action', title: 'Alternar tema (Claro / Escuro)', subtitle: 'Troca o esquema visual do sistema', icon: 'palette', badge: 'Aparência' },
  ];

  filteredItems = computed<CommandItem[]>(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.selectedCategory();
    const result: CommandItem[] = [];

    // 1. Ações do Sistema
    if (cat === 'all' || cat === 'action') {
      const actions = !q
        ? this.systemActions
        : this.systemActions.filter(a => a.title.toLowerCase().includes(q) || (a.subtitle && a.subtitle.toLowerCase().includes(q)));
      result.push(...actions);
    }

    // 2. Eventos do Calendário
    if (cat === 'all' || cat === 'event') {
      const matchedEvents = this.events.filter(e => {
        if (!q) return true;
        return (
          e.title.toLowerCase().includes(q) ||
          (e.description && e.description.toLowerCase().includes(q)) ||
          (e.category && e.category.toLowerCase().includes(q)) ||
          e.date.includes(q)
        );
      }).slice(0, 15);

      for (const e of matchedEvents) {
        result.push({
          id: 'ev-' + e.id,
          type: 'event',
          title: e.title,
          subtitle: `${e.date} · ${e.allDay ? 'Dia inteiro' : e.startTime + ' - ' + e.endTime}${e.category ? ' · ' + e.category : ''}`,
          icon: 'calendar_month',
          color: e.color || 'var(--brand-500)',
          badge: 'Agenda',
          data: e,
        });
      }
    }

    // 3. Tarefas do Kanban
    if (cat === 'all' || cat === 'task') {
      const matchedTasks = this.tasks.filter(t => {
        if (!q) return false; // Em busca vazia, prioriza ações
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.labels && t.labels.some(l => l.toLowerCase().includes(q)))
        );
      }).slice(0, 15);

      for (const t of matchedTasks) {
        result.push({
          id: 'task-' + t.id,
          type: 'task',
          title: t.title,
          subtitle: `Prioridade: ${t.priority}${t.dueDate ? ' · Vence em ' + t.dueDate : ''}`,
          icon: 'check_circle_outline',
          badge: 'Tarefa',
          data: t,
        });
      }
    }

    // 4. Cartões do Mural
    if (cat === 'all' || cat === 'mural') {
      const matchedMural = this.muralItems.filter(m => {
        if (!q) return false;
        return (
          m.title.toLowerCase().includes(q) ||
          (m.content && m.content.toLowerCase().includes(q))
        );
      }).slice(0, 15);

      for (const m of matchedMural) {
        result.push({
          id: 'mural-' + m.id,
          type: 'mural',
          title: m.title,
          subtitle: m.content ? m.content.slice(0, 60) + '...' : 'Nota do mural',
          icon: 'space_dashboard',
          color: m.color,
          badge: 'Mural',
          data: m,
        });
      }
    }

    return result;
  });

  @HostListener('window:keydown', ['$event'])
  handleGlobalKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close.emit();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const max = this.filteredItems().length;
      if (max > 0) this.selectedIndex.update(i => (i + 1) % max);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const max = this.filteredItems().length;
      if (max > 0) this.selectedIndex.update(i => (i - 1 + max) % max);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const items = this.filteredItems();
      const item = items[this.selectedIndex()];
      if (item) this.executeItem(item);
    }
  }

  setCategory(cat: 'all' | 'event' | 'task' | 'mural' | 'action'): void {
    this.selectedCategory.set(cat);
    this.selectedIndex.set(0);
  }

  executeItem(item: CommandItem): void {
    if (item.type === 'action') {
      if (item.id === 'act-toggle-theme') {
        this.themeService.toggle();
      } else {
        this.triggerAction.emit(item.id);
      }
      this.close.emit();
    } else if (item.type === 'event' && item.data) {
      this.selectEvent.emit(item.data);
      this.close.emit();
    } else if (item.type === 'task' && item.data) {
      this.selectTask.emit(item.data);
      this.close.emit();
    } else if (item.type === 'mural' && item.data) {
      this.selectMuralItem.emit(item.data);
      this.close.emit();
    }
  }
}
