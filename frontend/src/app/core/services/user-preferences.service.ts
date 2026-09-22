import { Injectable, computed, signal } from '@angular/core';

export type StoredTheme =
  | 'light'
  | 'dark'
  | 'dark-angel'
  | 'dark-demon'
  | 'light-angel'
  | 'light-demon'
  | 'dark-cadu'
  | 'light-cadu';

export type StoredCalendarView = 'month' | 'week' | 'day';

export interface UserPreferences {
  theme: StoredTheme;
  calendarView: StoredCalendarView;
  collapsedSidebarSections: string[];
  agendaPillsExpanded: boolean;
}

const THEMES: StoredTheme[] = [
  'light', 'dark', 'dark-angel', 'dark-demon', 'light-angel', 'light-demon', 'dark-cadu', 'light-cadu',
];
const CALENDAR_VIEWS: StoredCalendarView[] = ['month', 'week', 'day'];

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
  private readonly storageKey = 'agenda-user-preferences-v1';
  private readonly legacyThemeKey = 'agenda-theme';
  private readonly state = signal<UserPreferences>(this.load());

  readonly preferences = this.state.asReadonly();
  readonly theme = computed(() => this.state().theme);
  readonly calendarView = computed(() => this.state().calendarView);
  readonly collapsedSidebarSections = computed(() => this.state().collapsedSidebarSections);
  readonly agendaPillsExpanded = computed(() => this.state().agendaPillsExpanded);

  setTheme(theme: StoredTheme): void {
    this.update({ theme });
  }

  setCalendarView(calendarView: StoredCalendarView): void {
    this.update({ calendarView });
  }

  setCollapsedSidebarSections(collapsedSidebarSections: Iterable<string>): void {
    this.update({ collapsedSidebarSections: [...new Set(collapsedSidebarSections)] });
  }

  setAgendaPillsExpanded(agendaPillsExpanded: boolean): void {
    this.update({ agendaPillsExpanded });
  }

  private update(changes: Partial<UserPreferences>): void {
    const next = { ...this.state(), ...changes };
    this.state.set(next);
    this.save(next);
  }

  private load(): UserPreferences {
    const defaults = this.defaults();
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        const legacyTheme = localStorage.getItem(this.legacyThemeKey);
        return THEMES.includes(legacyTheme as StoredTheme)
          ? { ...defaults, theme: legacyTheme as StoredTheme }
          : defaults;
      }

      const saved = JSON.parse(raw) as Partial<UserPreferences>;
      return {
        theme: THEMES.includes(saved.theme as StoredTheme) ? saved.theme as StoredTheme : defaults.theme,
        calendarView: CALENDAR_VIEWS.includes(saved.calendarView as StoredCalendarView)
          ? saved.calendarView as StoredCalendarView
          : defaults.calendarView,
        collapsedSidebarSections: Array.isArray(saved.collapsedSidebarSections)
          ? [...new Set(saved.collapsedSidebarSections.filter(section => typeof section === 'string'))]
          : defaults.collapsedSidebarSections,
        agendaPillsExpanded: typeof saved.agendaPillsExpanded === 'boolean'
          ? saved.agendaPillsExpanded
          : defaults.agendaPillsExpanded,
      };
    } catch {
      return defaults;
    }
  }

  private save(preferences: UserPreferences): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(preferences));
      localStorage.removeItem(this.legacyThemeKey);
    } catch {
      // A aplicação continua funcionando quando o armazenamento está indisponível.
    }
  }

  private defaults(): UserPreferences {
    const prefersDark =
      typeof window !== 'undefined' &&
      !!window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    return {
      theme: prefersDark ? 'dark' : 'light',
      calendarView: 'month',
      collapsedSidebarSections: [],
      agendaPillsExpanded: true,
    };
  }
}
