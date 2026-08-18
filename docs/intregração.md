TODA URL TEM QUE TER ROTA PARA /?token=
EXEMPLO: http://192.168.13.249:5079/?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

## BUSCAR TODOS USUARIOS COM DEPARTAMENTO
http://192.168.13.249:7000/api/users/all
export interface UserAll {
  success: boolean
  message: any
  data: Data
  errors: any
  meta: any
}

export interface Data {
  userResponses: UserResponse[]
}

export interface UserResponse {
  id: string
  createdAt: string
  updatedAt: string
  name: string
  email: string
  departamentId: string
  avatar: string
  isActive: boolean
  departament: Departament
  roles: Role[]
  pemisssions: Pemisssion[]
}

export interface Departament {
  id: string
  name: string
}

export interface Role {
  id: string
  name: string
}

export interface Pemisssion {
  id: string
  name: string
}

## BUSCAR USUARIO ATUAL COM DEPARTAMENTO
http://192.168.13.249:7000/api/auth/me
export interface UserMe {
  success: boolean
  message: any
  data: Data
  errors: any
  meta: any
}

export interface Data {
  id: string
  email: string
  roles: string[]
  permissions: string[]
}
