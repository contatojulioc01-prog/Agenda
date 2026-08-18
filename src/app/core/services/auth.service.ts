import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { UserMe, UserAll, UserResponse, UserProfile } from '../models/user.model';

function getApiBase(): string {
  if (typeof window !== 'undefined' && window.location.hostname) {
    return `http://${window.location.hostname}:9900/api`;
  }
  return 'http://192.168.13.244:9900/api';
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

        if (me && me.data) {
          const matchingUser = userList.find(u =>
            (u.email && u.email.toLowerCase() === me.data.email.toLowerCase()) ||
            u.id === me.data.id
          );

          const profile: UserProfile = {
            id: me.data.id,
            email: me.data.email,
            roles: me.data.roles || [],
            permissions: me.data.permissions || [],
            name: matchingUser ? matchingUser.name : me.data.email.split('@')[0],
            avatar: matchingUser?.avatar,
            departamentName: matchingUser?.departament?.name || 'Geral',
          };
          this.currentUser.set(profile);
          this.isAuthenticated.set(true);
        } else {
          // Usuário padrão caso a resposta venha sem me.data
          const defaultUser = userList[0] || {
            id: 'user-me',
            name: 'Meu Usuário',
            email: 'usuario@empresa.com.br',
            departament: { id: 'd1', name: 'Tecnologia' }
          };
          this.currentUser.set({
            id: defaultUser.id,
            name: defaultUser.name,
            email: defaultUser.email,
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
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.data?.userResponses)) return res.data.userResponses;
    if (Array.isArray(res.data?.users)) return res.data.users;
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.userResponses)) return res.userResponses;
    if (Array.isArray(res.users)) return res.users;
    return [];
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
