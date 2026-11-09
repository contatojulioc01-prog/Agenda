import { Attachment } from './attachment.model';

export interface EventAttendee {
  id: string;
  eventId: string;
  userId?: string | null;
  name: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined' | 'tentative';
  role: 'organizer' | 'required' | 'optional';
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  interval?: number;
  daysOfWeek?: number[]; // 0 = Dom, 1 = Seg, ..., 6 = Sab
  endType?: 'never' | 'after_occurrences' | 'on_date';
  occurrences?: number;
  untilDate?: string; // 'YYYY-MM-DD'
}

export interface CalendarEvent {
  id: string;
  calendarId: string;   // ID da agenda à qual o evento pertence
  title: string;
  description: string;
  date: string;        // 'YYYY-MM-DD'
  endDate?: string;    // 'YYYY-MM-DD' (para eventos que duram múltiplos dias)
  startTime: string;   // 'HH:MM' (horário padrão ou do primeiro dia)
  endTime: string;     // 'HH:MM' (horário padrão ou do último dia)
  dayTimes?: Record<string, { startTime: string; endTime: string }>; // Horários individuais por dia ('YYYY-MM-DD' -> { startTime, endTime })
  color: EventColor;
  category: string;
  allDay: boolean;
  location?: string;
  meetingUrl?: string;
  recurrenceRule?: RecurrenceRule | null;
  recurrenceParentId?: string | null;
  copyGroupId?: string;
  /** Evento calculado pelo sistema, sem edição manual. */
  isSystem?: boolean;
  /** Prazo sincronizado de uma tarefa; editável somente pelo card no Kanban. */
  isTaskDeadline?: boolean;
  /** Referências usadas para abrir o card de origem a partir da agenda. */
  taskId?: string;
  taskBoardId?: string;
  taskParentId?: string;
  attachments: Attachment[];
  attendees?: EventAttendee[];
}

export type EventColor =
  | 'indigo'
  | 'blue'
  | 'teal'
  | 'emerald'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'purple'
  | 'pink'
  | 'slate';

export const EVENT_COLOR_MAP: Record<EventColor, string> = {
  indigo:  '#4f46e5',
  blue:    '#0284c7',
  teal:    '#0d9488',
  emerald: '#059669',
  amber:   '#d97706',
  orange:  '#ea580c',
  rose:    '#e11d48',
  purple:  '#9333ea',
  pink:    '#db2777',
  slate:   '#475569',
};

export const EVENT_COLOR_LABELS: Record<EventColor, string> = {
  indigo:  'Índigo',
  blue:    'Azul',
  teal:    'Verde-azulado',
  emerald: 'Esmeralda',
  amber:   'Âmbar',
  orange:  'Laranja',
  rose:    'Rosa',
  purple:  'Roxo',
  pink:    'Pink',
  slate:   'Cinza',
};
