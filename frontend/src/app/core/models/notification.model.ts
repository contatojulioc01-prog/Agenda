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
