export type CalendarPermission = 'owner' | 'editor' | 'viewer';

export interface CalendarMember {
  id: string;
  calendar_id: string;
  user_id: string;
  permission: CalendarPermission;
  // Enriquecido no frontend com dados da API de usuários
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
}

export interface Calendar {
  id: string;
  name: string;
  color: string;
  isPrivate: boolean;
  isDefault?: boolean;
  isTaskCalendar?: boolean;
  taskTeamName?: string | null;
  owner_id: string;
  created_at: string;
  members: CalendarMember[];
  // Resolvido no frontend
  my_permission?: CalendarPermission;
}

export const CALENDAR_COLORS = [
  { value: '#4f46e5', label: 'Índigo' },
  { value: '#0284c7', label: 'Azul' },
  { value: '#0d9488', label: 'Verde-azulado' },
  { value: '#059669', label: 'Esmeralda' },
  { value: '#d97706', label: 'Âmbar' },
  { value: '#ea580c', label: 'Laranja' },
  { value: '#e11d48', label: 'Rosa' },
  { value: '#9333ea', label: 'Roxo' },
  { value: '#db2777', label: 'Pink' },
  { value: '#475569', label: 'Cinza' },
];
