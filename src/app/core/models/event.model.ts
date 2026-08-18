export interface CalendarEvent {
  id: string;
  calendarId: string;   // ID da agenda à qual o evento pertence
  title: string;
  description: string;
  date: string;        // 'YYYY-MM-DD'
  startTime: string;   // 'HH:MM'
  endTime: string;     // 'HH:MM'
  color: EventColor;
  category: string;
  allDay: boolean;
  attendees?: string[]; // IDs ou nomes de participantes
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
