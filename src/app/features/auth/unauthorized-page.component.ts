import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-unauthorized-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-icon-badge">
          <mat-icon>lock</mat-icon>
        </div>
        <h1>Acesso Corporativo Restrito</h1>
        <p class="auth-desc">
          Esta agenda é restrita aos colaboradores autorizados. O acesso deve ser realizado através do portal corporativo com o token de autenticação na URL.
        </p>

        <div class="token-input-box">
          <label for="manual-token">Inserir Token JWT Manualmente:</label>
          <div class="input-row">
            <input
              id="manual-token"
              type="text"
              [(ngModel)]="manualToken"
              placeholder="Cole o token recebido no portal..."
            />
            <button class="btn-submit" (click)="applyToken()" [disabled]="!manualToken.trim()">
              Acessar
            </button>
          </div>
        </div>

        <div class="auth-footer-help">
          <p>Exemplo de rota esperada:</p>
          <code>http://192.168.13.244:5079/?token=eyJhbGciOi...</code>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .auth-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      width: 100vw;
      background: var(--bg-app, #f1f5f9);
      padding: 20px;
      box-sizing: border-box;
    }

    .auth-card {
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 20px;
      padding: 40px 36px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.08);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .auth-icon-badge {
      width: 60px;
      height: 60px;
      border-radius: 16px;
      background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 18px rgba(239, 68, 68, 0.35);
      margin-bottom: 20px;

      mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
      }
    }

    h1 {
      margin: 0 0 10px 0;
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary, #0f172a);
    }

    .auth-desc {
      margin: 0 0 24px 0;
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-secondary, #475569);
    }

    .token-input-box {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 24px;

      label {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--text-secondary, #475569);
      }
    }

    .input-row {
      display: flex;
      gap: 8px;
      width: 100%;

      input {
        flex: 1;
        height: 44px;
        padding: 0 14px;
        border: 1.5px solid var(--border, #e2e8f0);
        border-radius: 10px;
        font-size: 13.5px;
        background: var(--bg-input, #f8fafc);
        color: var(--text-primary, #0f172a);
        outline: none;

        &:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
        }
      }
    }

    .btn-submit {
      padding: 0 20px;
      height: 44px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
      color: #ffffff;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
      transition: all 0.2s ease;

      &:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(79, 70, 229, 0.35);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .auth-footer-help {
      font-size: 12px;
      color: var(--text-muted, #94a3b8);

      p {
        margin: 0 0 4px 0;
      }

      code {
        background: var(--bg-hover, #f1f5f9);
        padding: 4px 8px;
        border-radius: 6px;
        font-family: monospace;
        font-size: 11px;
        color: var(--text-secondary, #475569);
        word-break: break-all;
      }
    }
  `]
})
export class UnauthorizedPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  manualToken = '';

  applyToken(): void {
    if (this.manualToken.trim()) {
      this.authService.setToken(this.manualToken.trim());
      this.router.navigate(['/']);
    }
  }
}
