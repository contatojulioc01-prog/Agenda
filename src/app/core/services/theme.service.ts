import { Injectable, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'agenda-theme';

  isDark = signal<boolean>(this.loadTheme());

  constructor() {
    // Aplica imediatamente
    this.applyTheme(this.isDark());

    // E reage a mudanças
    effect(() => {
      this.applyTheme(this.isDark());
    });
  }

  toggle(): void {
    this.isDark.update(v => !v);
    try {
      localStorage.setItem(this.STORAGE_KEY, this.isDark() ? 'dark' : 'light');
    } catch {
      // Ignora
    }
  }

  private loadTheme(): boolean {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) return saved === 'dark';
      return (
        typeof window !== 'undefined' &&
        !!window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      );
    } catch {
      return false;
    }
  }

  private applyTheme(dark: boolean): void {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    }
  }
}
