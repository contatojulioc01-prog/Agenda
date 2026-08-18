export interface UserAll {
  success: boolean;
  message: any;
  data: {
    userResponses: UserResponse[];
  };
  errors: any;
  meta: any;
}

export interface UserResponse {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  email: string;
  departamentId: string;
  avatar: string;
  isActive: boolean;
  departament: Departament;
  roles: Role[];
  pemisssions: Permission[];
}

export interface Departament {
  id: string;
  name: string;
}

export interface Role {
  id: string;
  name: string;
}

export interface Permission {
  id: string;
  name: string;
}

export interface UserMe {
  success?: boolean;
  message?: any;
  avatar?: string;
  name?: string;
  email?: string;
  data?: {
    id: string;
    name?: string;
    email: string;
    avatar?: string;
    departament?: Departament;
    departamentName?: string;
    roles?: string[];
    permissions?: string[];
  };
  errors?: any;
  meta?: any;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  departamentName?: string;
  roles: string[];
  permissions: string[];
}

/** Avatar corporativo padrão caso o usuário não possua foto cadastrada */
export const DEFAULT_AVATAR = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="32" fill="%236366f1"/><path d="M32 34c5.523 0 10-4.477 10-10s-4.477-10-10-10-10 4.477-10 10 4.477 10 10 10zm0 4c-6.67 0-20 3.34-20 10v4h40v-4c0-6.66-13.33-10-20-10z" fill="%23ffffff"/></svg>`;

