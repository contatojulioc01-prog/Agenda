export type AdminBannerLevel = 'info' | 'warning' | 'danger';

export interface SystemBanner {
  enabled: boolean;
  message: string;
  level: AdminBannerLevel;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface AdminOnlineUser {
  userId: string;
  websocket: number;
  sse: number;
}

export interface AdminOverview {
  version: string;
  nodeVersion: string;
  environment: string;
  uptimeSeconds: number;
  serverTime: string;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  database: {
    connected: boolean;
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    database: string;
    latencyMs: number;
  };
  realtime: {
    websocketClients: number;
    sseClients: number;
    uniqueOnlineUsers: number;
    onlineUsers: AdminOnlineUser[];
  };
  authCacheSize: number;
  banner: SystemBanner;
}

export interface IntegrationHealthItem {
  name: string;
  url?: string;
  status: 'ok' | 'degraded' | 'down';
  httpStatus?: number | null;
  latencyMs: number;
  details?: string;
  error?: string;
}

export interface IntegrationsHealthResponse {
  checkedAt: string;
  integrations: IntegrationHealthItem[];
}

export interface AuthCacheEntry {
  tokenFingerprint: string;
  userId: string;
  name: string | null;
  email: string | null;
  roles: string[];
  isDev: boolean;
  ttlSeconds: number;
  expired: boolean;
}

export interface UserDiagnostics {
  userId: string;
  calendars: {
    owned: Array<{ id: string; name: string; color: string; is_private: number; is_default: number; is_task_calendar: number }>;
    shared: Array<{ id: string; name: string; owner_id: string; permission: string }>;
  };
  kanban: {
    teams: Array<{ id: string; name: string; owner_id: string; role: string }>;
    boards: Array<{ id: string; name: string; scope_type: string; owner_id: string; team_id: string | null }>;
  };
  murals: Array<{ id: string; name: string; scope_type: string; owner_id: string; team_id: string | null }>;
  devices: Array<{ id: string; name: string; enabled: number; created_at: string; last_seen_at: string | null }>;
  pendingInvitations: {
    calendars: Array<{ id: string; calendar_id: string; permission: string; status: string; created_at: string }>;
    teams: Array<{ id: string; team_id: string; invited_by: string; status: string; created_at: string }>;
  };
}

export interface AdminNotificationDevice {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface AdminNotificationDelivery {
  id: string;
  device_id: string;
  user_id: string;
  source_type: string;
  source_id: string;
  occurrence_date: string;
  scheduled_for: string;
  delivered_at: string;
}

export interface AdminStorageSummary {
  tables: Array<{ table: string; count: number }>;
  attachments: {
    totalCount: number;
    totalBytes: number;
    legacyDbCount: number;
    diskCount: number;
    orphanCount: number;
    orphanBytes: number;
    largest: Array<{
      id: string;
      owner_type: string;
      owner_id: string;
      file_name: string;
      mime_type: string;
      byte_size: number;
      created_by: string;
      created_at: string;
    }>;
  };
}

export interface AdminTrashTask {
  id: string;
  board_id: string;
  board_name: string | null;
  title: string;
  priority: string;
  deleted_at: string;
  deleted_by: string | null;
  created_by: string | null;
}

export interface AdminMigration {
  id: string;
  applied_at: string;
}

export interface AdminPendingInvitations {
  calendarInvitations: Array<{
    id: string;
    resource_id: string;
    resource_name: string | null;
    user_id: string;
    role: string;
    created_at: string;
  }>;
  teamInvitations: Array<{
    id: string;
    resource_id: string;
    resource_name: string | null;
    user_id: string;
    invited_by: string;
    created_at: string;
  }>;
}

export interface AdminAuditLog {
  id: string;
  actor_user_id: string;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, any>;
  ip_address: string | null;
  created_at: string;
}

export interface AdminServerLog {
  id: number;
  level: 'error' | 'warn' | string;
  message: string;
  timestamp: string;
}
