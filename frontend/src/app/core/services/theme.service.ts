import { Injectable, effect, inject } from '@angular/core';
import { StoredTheme, UserPreferencesService } from './user-preferences.service';

/**
 * Temas disponíveis:
 *  - light       → modo claro padrão
 *  - dark        → modo escuro padrão
 *  - dark-angel  → reino angelical (fundo roxo/branco, partículas de luz)
 *  - dark-demon  → reino demoníaco (fundo preto/vermelho, chamas)
 *  - light-angel → reino angelical claro
 *  - light-demon → reino demoníaco claro
 *  - dark-cadu   → modo Cadu Maverick escuro (Ondas noturnas da Ilha Pen Gu, turquesa bioluminescente & sunset âmbar)
 *  - light-cadu  → modo Cadu Maverick claro (Praia tropical de Pen Gu, mar cristalino turquesa & sol dourado)
 */
export type Theme = StoredTheme;

/** Qual "reino" especial está ativo (null = nenhum) */
export type Realm = 'angel' | 'demon' | 'cadu' | null;

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly userPreferences = inject(UserPreferencesService);

  readonly theme = this.userPreferences.theme;

  /** true quando qualquer variante escura está ativa */
  isDark = (() => {
    const t = this.theme;
    return () => t() === 'dark' || t() === 'dark-angel' || t() === 'dark-demon' || t() === 'dark-cadu';
  })();

  /** Qual reino especial está ativo */
  realm = (() => {
    const t = this.theme;
    return (): Realm => {
      if (t() === 'dark-angel' || t() === 'light-angel') return 'angel';
      if (t() === 'dark-demon' || t() === 'light-demon') return 'demon';
      if (t() === 'dark-cadu' || t() === 'light-cadu') return 'cadu';
      return null;
    };
  })();

  private keyBuffer = '';
  private keyTimeout?: any;

  constructor() {
    effect(() => {
      this.applyTheme(this.theme());
    });
    this.initEasterEggListener();
  }

  /**
   * Toggle normal do botão de tema:
   *  - Sem reino: alterna light ↔ dark
   *  - Com reino: alterna entre light e o tema do reino ativo
   */
  toggle(): void {
    const current = this.theme();
    if (current === 'dark-angel') this.setTheme('light-angel');
    else if (current === 'light-angel') this.setTheme('dark-angel');
    else if (current === 'dark-demon') this.setTheme('light-demon');
    else if (current === 'light-demon') this.setTheme('dark-demon');
    else if (current === 'dark-cadu') this.setTheme('light-cadu');
    else if (current === 'light-cadu') this.setTheme('dark-cadu');
    else if (current === 'dark') this.setTheme('light');
    else this.setTheme('dark');
  }

  /**
   * Clique na imagem do sidebar:
   * Cicla entre nenhum reino → angel → demon → cadu → nenhum
   * Mantém o tom escuro/claro atual
   */
  cycleRealm(): void {
    const current = this.theme();
    if (current === 'dark-angel') {
      this.setTheme('dark-demon');
    } else if (current === 'dark-demon') {
      this.setTheme('dark-cadu');
    } else if (current === 'dark-cadu') {
      this.setTheme('dark');
    } else if (current === 'dark') {
      this.setTheme('dark-angel');
    } else if (current === 'light-angel') {
      this.setTheme('light-demon');
    } else if (current === 'light-demon') {
      this.setTheme('light-cadu');
    } else if (current === 'light-cadu') {
      this.setTheme('light');
    } else {
      this.setTheme('light-angel');
    }
  }

  setTheme(t: Theme): void {
    this.userPreferences.setTheme(t);
  }

  private applyTheme(t: Theme): void {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', t);
    }
  }

  /**
   * Easter egg escondido: digitar 'cadu' ou 'maverick' em qualquer tela
   * ativa o tema especial de surf da Ilha Pen Gu!
   */
  private initEasterEggListener(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Ignora se estiver digitando em inputs ou textarea
      const target = e.target as HTMLElement;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target?.isContentEditable) {
        return;
      }

      if (e.key.length === 1 && /[a-zA-Z]/i.test(e.key)) {
        this.keyBuffer += e.key.toLowerCase();
        if (this.keyBuffer.length > 15) this.keyBuffer = this.keyBuffer.slice(-15);

        clearTimeout(this.keyTimeout);
        this.keyTimeout = setTimeout(() => { this.keyBuffer = ''; }, 2500);

        if (this.keyBuffer.includes('cadu') || this.keyBuffer.includes('maverick') || this.keyBuffer.includes('surfsup')) {
          this.keyBuffer = '';
          const isDarkCurrent = this.isDark();
          this.setTheme(isDarkCurrent ? 'dark-cadu' : 'light-cadu');
        }
      }
    });
  }
}
