import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss'
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);

  toggle(): void {
    this.theme.toggle();
  }

  get title(): string {
    const t = this.theme.theme();
    if (t === 'dark-angel' || t === 'light-angel') return 'Modo Angelical — clique para alternar modo claro/escuro';
    if (t === 'dark-demon' || t === 'light-demon')  return 'Modo Demoníaco — clique para alternar modo claro/escuro';
    if (t === 'dark')        return 'Ativar modo claro';
    return 'Ativar modo escuro';
  }
}
