import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AppLoadingService } from './core/services/app-loading.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly loading = inject(AppLoadingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly themeService = inject(ThemeService);
  private readonly startedAt = Date.now();
  private dismissScheduled = false;

  readonly loadingVisible = signal(true);
  readonly loadingLeaving = signal(false);

  constructor() {
    // A injeção aplica o tema salvo antes de revelar o restante da interface.
    this.themeService.theme();

    effect(() => {
      if (this.loading.ready()) this.scheduleDismiss();
    });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(event => {
        if (event.urlAfterRedirects.startsWith('/unauthorized')) {
          this.loading.complete();
        } else {
          // Quando a navegação inicial é concluída, sinaliza prontidão
          window.setTimeout(() => this.loading.complete(), 300);
        }
      });

    // Fallback de segurança (3.5s) para nunca travar o usuário
    const fallbackTimer = window.setTimeout(() => this.loading.complete(), 3_500);
    this.destroyRef.onDestroy(() => window.clearTimeout(fallbackTimer));
  }

  private scheduleDismiss(): void {
    if (this.dismissScheduled) return;
    this.dismissScheduled = true;
    const minimumDisplayTime = 1_500;
    const remainingTime = Math.max(0, minimumDisplayTime - (Date.now() - this.startedAt));

    const leaveTimer = window.setTimeout(() => {
      this.loadingLeaving.set(true);
      const removeTimer = window.setTimeout(() => this.loadingVisible.set(false), 200);
      this.destroyRef.onDestroy(() => window.clearTimeout(removeTimer));
    }, remainingTime);
    this.destroyRef.onDestroy(() => window.clearTimeout(leaveTimer));
  }
}
