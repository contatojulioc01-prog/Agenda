import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, forkJoin, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { UserMe, UserResponse, UserProfile, DEFAULT_AVATAR } from '../models/user.model';

function getApiBase(): string {
  // Retorna caminho relativo para ser interceptado pelo proxy.conf.json do Angular
  // escondendo totalmente o IP e Porta reais do backend no F12 -> Network
  return '/api';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly TOKEN_KEY = 'agenda_token';
  private readonly initialToken = this.getInitialToken();

  // Signals de estado
  token = signal<string | null>(this.initialToken);
  currentUser = signal<UserProfile | null>(null);
  allUsers = signal<UserResponse[]>([]);
  isLoading = signal<boolean>(false);
  isAuthenticated = signal<boolean>(!!this.initialToken);

  constructor() {
    const currentToken = this.token();
    if (currentToken) {
      this.validateSsoTicket(currentToken).subscribe();
    }
  }

  /** Captura o ticket ou token da URL (?ticket=... ou ?token=...) ou do localStorage */
  private getInitialToken(): string | null {
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlTicket = urlParams.get('ticket') || urlParams.get('token');
        if (urlTicket && urlTicket.trim().length > 0) {
          const cleanToken = urlTicket.trim();
          urlParams.delete('ticket');
          urlParams.delete('token');
          const remainingQuery = urlParams.toString();
          const cleanUrl = `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${window.location.hash}`;
          window.history.replaceState(window.history.state, document.title, cleanUrl);
          if (this.isTokenExpired(cleanToken)) {
            localStorage.removeItem(this.TOKEN_KEY);
            return null;
          }
          localStorage.setItem(this.TOKEN_KEY, cleanToken);
          return cleanToken;
        }
        const storedToken = localStorage.getItem(this.TOKEN_KEY);
        if (storedToken && this.isTokenExpired(storedToken)) {
          localStorage.removeItem(this.TOKEN_KEY);
          return null;
        }
        return storedToken;
      } catch {
        return null;
      }
    }
    return null;
  }

  /** Valida o ticket de handoff SSO enviando ao backend da Agenda */
  validateSsoTicket(ticket: string): Observable<any> {
    const proxyUrl = `${getApiBase()}/auth/sso-login`;
    return this.http.post<any>(proxyUrl, { ticket }).pipe(
      map(res => {
        if (res && (res.success || res.token || res.data || res.user)) {
          const sessionToken = res.token || ticket;
          localStorage.setItem(this.TOKEN_KEY, sessionToken);
          this.token.set(sessionToken);
          this.isAuthenticated.set(true);

          const meData = res.data || res.user;
          if (meData && (meData.id || meData.email)) {
            const profile: UserProfile = {
              id: meData.id || meData.userId || '',
              email: meData.email || '',
              roles: meData.roles || [],
              permissions: meData.permissions || [],
              name: meData.name || meData.email?.split('@')[0] || 'Usuário',
              avatar: meData.avatar || DEFAULT_AVATAR,
              departamentName: meData.departamentName || meData.departament?.name || 'Geral',
            };
            if (profile.id) {
              this.currentUser.set(profile);
            }
          }
          this.loadUserData();
          return res;
        }
        throw new Error(res?.error || 'Validação de ticket falhou');
      }),
      catchError(err => {
        console.warn('[AuthService] Falha na validação de ticket SSO:', err.message);
        this.loadUserData();
        return of(null);
      })
    );
  }

  /** Define um novo token manualmente ou vindo de navegação */
  setToken(token: string): boolean {
    const cleanToken = token.trim();
    if (cleanToken && !this.isTokenExpired(cleanToken)) {
      if (this.token() === cleanToken && this.isLoading()) return true;
      localStorage.setItem(this.TOKEN_KEY, cleanToken);
      this.token.set(cleanToken);
      this.isAuthenticated.set(true);

      // Tenta validar como ticket SSO
      this.validateSsoTicket(cleanToken).subscribe();
      return true;
    }
    this.clearSession();
    return false;
  }

  getToken(): string | null {
    return this.token();
  }

  /** Carrega os dados do usuário atual e lista completa de colaboradores */
  loadUserData(): void {
    const currentToken = this.getToken();
    if (!currentToken) {
      this.currentUser.set(null);
      this.isAuthenticated.set(false);
      return;
    }

    this.isLoading.set(true);

    forkJoin({
      me: this.fetchMe(),
      users: this.fetchUsers(),
    }).subscribe({
      next: ({ me, users }) => {
        const userList = users || [];
        this.allUsers.set(userList);

        const meAny = me as any;
        const meData = me?.data || meAny?.user || meAny;
        if (me && (me.data || meAny.id || meAny.email)) {
          const userEmail = meData?.email || meAny.email || '';
          const userId = meData?.id || meAny.id || '';
          const matchingUser = userList.find(u =>
            (u.email && userEmail && u.email.toLowerCase() === userEmail.toLowerCase()) ||
            (u.id && userId && u.id === userId)
          );
          const resolvedUserId = userId || matchingUser?.id;
          if (!resolvedUserId) {
            this.invalidateSession();
            this.isLoading.set(false);
            return;
          }

          const avatarUrl = meData?.avatar || meAny.avatar || meData?.icon || meAny.icon || matchingUser?.avatar || DEFAULT_AVATAR;

          const profile: UserProfile = {
            id: resolvedUserId,
            email: userEmail || matchingUser?.email || '',
            roles: meData?.roles || meAny.roles || [],
            permissions: meData?.permissions || meAny.permissions || [],
            name: meData?.name || meAny.name || matchingUser?.name || userEmail.split('@')[0] || 'Usuário',
            avatar: avatarUrl,
            departamentName: meData?.departament?.name || meData?.departamentName || matchingUser?.departament?.name || 'Geral',
          };
          this.currentUser.set(profile);
          this.isAuthenticated.set(true);
        } else this.invalidateSession();
        this.isLoading.set(false);
      },
      error: err => {
        if (err?.status === 401 || err?.status === 403) this.invalidateSession();
        else {
          this.currentUser.set(null);
          this.allUsers.set([]);
          this.isAuthenticated.set(false);
        }
        this.isLoading.set(false);
      }
    });
  }

  fetchMe(): Observable<UserMe> {
    const proxyUrl = `${getApiBase()}/auth/me`;

    return this.http.get<UserMe>(proxyUrl).pipe(
      catchError(err => {
        console.warn('[AuthService] /auth/me indisponível via proxy:', err.message);
        return throwError(() => err);
      })
    );
  }

  fetchUsers(): Observable<UserResponse[]> {
    const proxyUrl = `${getApiBase()}/users/all`;

    return this.http.get<any>(proxyUrl).pipe(
      catchError(() => this.http.get<any>(`${getApiBase()}/users`)),
      map(res => this.extractUserList(res)),
      catchError(err => {
        console.warn('[AuthService] /users/all indisponível via proxy:', err.message);
        return of([]);
      })
    );
  }

  private extractUserList(res: any): UserResponse[] {
    let list: UserResponse[] = [];
    if (!res) list = [];
    else if (Array.isArray(res)) list = res;
    else if (Array.isArray(res.data?.userResponses)) list = res.data.userResponses;
    else if (Array.isArray(res.data?.users)) list = res.data.users;
    else if (Array.isArray(res.data)) list = res.data;
    else if (Array.isArray(res.userResponses)) list = res.userResponses;
    else if (Array.isArray(res.users)) list = res.users;

    // Filtra estritamente usuários com isActive === true
    return list.filter(u => u && (u.isActive === true || (u as any).isActive === 'true' || (u as any).isActive === 1));
  }

  logout(): void {
    this.clearSession();
  }

  private invalidateSession(): void {
    this.clearSession();
    void this.router.navigate(['/unauthorized']);
  }

  private clearSession(): void {
    try {
      localStorage.removeItem(this.TOKEN_KEY);
    } catch {}
    this.token.set(null);
    this.currentUser.set(null);
    this.allUsers.set([]);
    this.isAuthenticated.set(false);
  }

  private isTokenExpired(token: string): boolean {
    try {
      const payloadPart = token.split('.')[1];
      if (!payloadPart) return false;
      const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const payload = JSON.parse(atob(padded));
      return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
    } catch {
      return false;
    }
  }
}
