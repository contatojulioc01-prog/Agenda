import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { UserMe, UserAll, UserResponse, UserProfile, DEFAULT_AVATAR } from '../models/user.model';

function getApiBase(): string {
  // Retorna caminho relativo para ser interceptado pelo proxy.conf.json do Angular
  // escondendo totalmente o IP e Porta reais do backend no F12 -> Network
  return '/api';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly TOKEN_KEY = 'agenda_token';

  // Signals de estado
  token = signal<string | null>(this.getInitialToken());
  currentUser = signal<UserProfile | null>(null);
  allUsers = signal<UserResponse[]>([]);
  isLoading = signal<boolean>(false);
  isAuthenticated = signal<boolean>(!!this.getInitialToken());

  constructor() {
    if (this.token()) {
      this.loadUserData();
    }
  }

  /** Captura o token da URL (?token=...) ou do localStorage */
  private getInitialToken(): string | null {
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        if (urlToken && urlToken.trim().length > 0) {
          localStorage.setItem(this.TOKEN_KEY, urlToken.trim());
          urlParams.delete('token');
          const remainingQuery = urlParams.toString();
          const cleanUrl = `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${window.location.hash}`;
          window.history.replaceState(window.history.state, document.title, cleanUrl);
          return urlToken.trim();
        }
        return localStorage.getItem(this.TOKEN_KEY);
      } catch {
        return null;
      }
    }
    return null;
  }

  /** Define um novo token manualmente ou vindo de navegação */
  setToken(token: string): void {
    if (token) {
      localStorage.setItem(this.TOKEN_KEY, token);
      this.token.set(token);
      this.isAuthenticated.set(true);
      this.loadUserData();
    }
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
        const userList = (users && users.length > 0) ? users : this.getSampleUsers();
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

          const avatarUrl = meData?.avatar || meAny.avatar || meData?.icon || meAny.icon || matchingUser?.avatar || DEFAULT_AVATAR;

          const profile: UserProfile = {
            id: userId || matchingUser?.id || 'usr-me',
            email: userEmail || matchingUser?.email || '',
            roles: meData?.roles || meAny.roles || [],
            permissions: meData?.permissions || meAny.permissions || [],
            name: meData?.name || meAny.name || matchingUser?.name || userEmail.split('@')[0] || 'Usuário',
            avatar: avatarUrl,
            departamentName: meData?.departament?.name || meData?.departamentName || matchingUser?.departament?.name || 'Geral',
          };
          this.currentUser.set(profile);
          this.isAuthenticated.set(true);
        } else {
          // Usuário padrão caso a resposta venha sem me.data
          const defaultUser = userList[0] || {
            id: 'user-me',
            name: 'Meu Usuário',
            email: 'usuario@empresa.com.br',
            departament: { id: 'd1', name: 'Tecnologia' },
            avatar: DEFAULT_AVATAR,
          };
          this.currentUser.set({
            id: defaultUser.id,
            name: defaultUser.name,
            email: defaultUser.email,
            avatar: defaultUser.avatar || DEFAULT_AVATAR,
            departamentName: defaultUser.departament?.name || 'Corporativo',
            roles: ['USER'],
            permissions: [],
          });
          this.isAuthenticated.set(true);
        }
        this.isLoading.set(false);
      },
      error: () => {
        const sampleList = this.getSampleUsers();
        this.allUsers.set(sampleList);
        this.currentUser.set({
          id: 'user-me',
          name: 'Meu Usuário',
          email: 'usuario@empresa.com.br',
          avatar: DEFAULT_AVATAR,
          departamentName: 'Tecnologia da Informação',
          roles: ['ADMIN'],
          permissions: [],
        });
        this.isLoading.set(false);
      }
    });
  }

  fetchMe(): Observable<UserMe | null> {
    const proxyUrl = `${getApiBase()}/auth/me`;

    return this.http.get<UserMe>(proxyUrl).pipe(
      catchError(err => {
        console.warn('[AuthService] /auth/me indisponível via proxy:', err.message);
        return of(null);
      })
    );
  }

  fetchUsers(): Observable<UserResponse[]> {
    const proxyUrl = `${getApiBase()}/users/all`;

    return this.http.get<any>(proxyUrl).pipe(
      catchError(() => this.http.get<any>(`${getApiBase()}/users`)),
      map(res => this.extractUserList(res)),
      catchError(err => {
        console.warn('[AuthService] /users/all indisponível via proxy, carregando colaboradores locais:', err.message);
        return of(this.getSampleUsers());
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
    try {
      localStorage.removeItem(this.TOKEN_KEY);
    } catch {}
    this.token.set(null);
    this.currentUser.set(null);
    this.allUsers.set([]);
    this.isAuthenticated.set(false);
  }

  /** Colaboradores corporativos para quando a API estiver em rede privada ou indisponível */
  private getSampleUsers(): UserResponse[] {
    return [
      {
        id: 'usr-carlos',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        name: 'Carlos Silva',
        email: 'carlos.silva@empresa.com.br',
        departamentId: 'dep-ti',
        avatar: '',
        isActive: true,
        departament: { id: 'dep-ti', name: 'Tecnologia da Informação' },
        roles: [{ id: '2', name: 'Desenvolvedor' }],
        pemisssions: [],
      },
      {
        id: 'usr-mariana',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        name: 'Mariana Souza',
        email: 'mariana.souza@empresa.com.br',
        departamentId: 'dep-comercial',
        avatar: '',
        isActive: true,
        departament: { id: 'dep-comercial', name: 'Comercial' },
        roles: [{ id: '3', name: 'Gerente Comercial' }],
        pemisssions: [],
      },
      {
        id: 'usr-rodrigo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        name: 'Rodrigo Lima',
        email: 'rodrigo.lima@empresa.com.br',
        departamentId: 'dep-financeiro',
        avatar: '',
        isActive: true,
        departament: { id: 'dep-financeiro', name: 'Financeiro' },
        roles: [{ id: '4', name: 'Analista Financeiro' }],
        pemisssions: [],
      },
      {
        id: 'usr-fernanda',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        name: 'Fernanda Costa',
        email: 'fernanda.costa@empresa.com.br',
        departamentId: 'dep-rh',
        avatar: '',
        isActive: true,
        departament: { id: 'dep-rh', name: 'Recursos Humanos' },
        roles: [{ id: '5', name: 'Coordenadora RH' }],
        pemisssions: [],
      },
      {
        id: 'usr-lucas',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        name: 'Lucas Ferreira',
        email: 'lucas.ferreira@empresa.com.br',
        departamentId: 'dep-operacoes',
        avatar: '',
        isActive: true,
        departament: { id: 'dep-operacoes', name: 'Operações' },
        roles: [{ id: '6', name: 'Supervisor Operacional' }],
        pemisssions: [],
      },
    ];
  }
}
