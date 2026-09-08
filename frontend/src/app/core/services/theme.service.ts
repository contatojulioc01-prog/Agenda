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
 */
export type Theme = StoredTheme;

/** Qual "reino" especial está ativo (null = nenhum) */
export type Realm = 'angel' | 'demon' | null;

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly userPreferences = inject(UserPreferencesService);

  readonly theme = this.userPreferences.theme;

  /** true quando qualquer variante escura está ativa */
  isDark = (() => {
    const t = this.theme;
    return () => t() === 'dark' || t() === 'dark-angel' || t() === 'dark-demon';
  })();

  /** Qual reino especial está ativo */
  realm = (() => {
    const t = this.theme;
    return (): Realm => {
      if (t() === 'dark-angel' || t() === 'light-angel') return 'angel';
      if (t() === 'dark-demon' || t() === 'light-demon')  return 'demon';
      return null;
    };
  })();

  constructor() {
    effect(() => {
      this.applyTheme(this.theme());
    });
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
    else if (current === 'dark') this.setTheme('light');
    else this.setTheme('dark');
  }

  /**
   * Clique na imagem do sidebar:
   * Cicla entre nenhum reino → angel → demon → nenhum
   * Mantém o tom escuro/claro atual
   */
  cycleRealm(): void {
    const current = this.theme();
    if (current === 'dark-angel') {
      this.setTheme('dark-demon');
    } else if (current === 'dark-demon') {
      this.setTheme('dark');
    } else if (current === 'dark') {
      this.setTheme('dark-angel');
    } else if (current === 'light-angel') {
      this.setTheme('light-demon');
    } else if (current === 'light-demon') {
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
}
