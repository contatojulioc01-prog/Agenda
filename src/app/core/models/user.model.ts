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
  success: boolean;
  message: any;
  data: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
  errors: any;
  meta: any;
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
