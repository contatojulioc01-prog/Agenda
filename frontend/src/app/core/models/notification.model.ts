export interface InAppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'mention' | 'rsvp' | 'task_assigned' | 'event_invite' | 'comment' | 'system';
  referenceType?: string | null;
  referenceId?: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  taskEnabled: boolean;
  eventEnabled: boolean;
  taskTime: string;
  taskDaysBefore: number;
  eventMinutesBefore: number;
}

export interface NotificationDevice {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface NotificationSettings {
  preferences: NotificationPreferences;
  devices: NotificationDevice[];
}
