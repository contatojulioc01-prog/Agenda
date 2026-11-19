import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AdminAuditLog,
  AdminBannerLevel,
  AdminMigration,
  AdminNotificationDelivery,
  AdminNotificationDevice,
  AdminOverview,
  AdminPendingInvitations,
  AdminServerLog,
  AdminStorageSummary,
  AdminTrashTask,
  AuthCacheEntry,
  IntegrationsHealthResponse,
  SystemBanner,
  UserDiagnostics,
} from '../../../core/models/admin.model';

@Injectable({ providedIn: 'root' })
export class AdminPageService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/admin';

  getOverview(): Observable<AdminOverview> {
    return this.http.get<AdminOverview>(`${this.baseUrl}/overview`);
  }

  getIntegrationsHealth(): Observable<IntegrationsHealthResponse> {
    return this.http.get<IntegrationsHealthResponse>(`${this.baseUrl}/integrations/health`);
  }

  sendRealtimeBroadcast(payload: { title: string; message: string; level: AdminBannerLevel }): Observable<any> {
    return this.http.post(`${this.baseUrl}/realtime/broadcast`, payload);
  }

  updateSystemBanner(payload: { enabled: boolean; message: string; level: AdminBannerLevel }): Observable<{ success: boolean; banner: SystemBanner }> {
    return this.http.put<{ success: boolean; banner: SystemBanner }>(`${this.baseUrl}/system/banner`, payload);
  }

  getAuthCache(): Observable<{ total: number; entries: AuthCacheEntry[] }> {
    return this.http.get<{ total: number; entries: AuthCacheEntry[] }>(`${this.baseUrl}/auth/cache`);
  }

  clearAuthCache(userId?: string): Observable<{ success: boolean; removed: number; remaining: number }> {
    const params = userId ? new HttpParams().set('userId', userId) : undefined;
    return this.http.delete<{ success: boolean; removed: number; remaining: number }>(`${this.baseUrl}/auth/cache`, { params });
  }

  getUserDiagnostics(userId: string): Observable<UserDiagnostics> {
    return this.http.get<UserDiagnostics>(`${this.baseUrl}/users/${encodeURIComponent(userId)}/diagnostics`);
  }

  getNotificationDevices(userId?: string): Observable<{ total: number; devices: AdminNotificationDevice[] }> {
    const params = userId ? new HttpParams().set('userId', userId) : undefined;
    return this.http.get<{ total: number; devices: AdminNotificationDevice[] }>(`${this.baseUrl}/notifications/devices`, { params });
  }

  toggleDevice(deviceId: string, enabled?: boolean): Observable<{ success: boolean; id: string; enabled: boolean }> {
    return this.http.patch<{ success: boolean; id: string; enabled: boolean }>(
      `${this.baseUrl}/notifications/devices/${encodeURIComponent(deviceId)}/toggle`,
      typeof enabled === 'boolean' ? { enabled } : {}
    );
  }

  getNotificationDeliveries(userId?: string, limit = 50): Observable<{ total: number; deliveries: AdminNotificationDelivery[] }> {
    let params = new HttpParams().set('limit', String(limit));
    if (userId) params = params.set('userId', userId);
    return this.http.get<{ total: number; deliveries: AdminNotificationDelivery[] }>(`${this.baseUrl}/notifications/deliveries`, { params });
  }

  sendTestNotification(userId: string, message: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/notifications/test`, { userId, message });
  }

  getStorageSummary(): Observable<AdminStorageSummary> {
    return this.http.get<AdminStorageSummary>(`${this.baseUrl}/storage/summary`);
  }

  cleanupOrphanAttachments(dryRun: boolean): Observable<any> {
    return this.http.post(`${this.baseUrl}/storage/cleanup-orphans`, { dryRun });
  }

  getTrashTasks(query = '', limit = 50): Observable<{ total: number; tasks: AdminTrashTask[] }> {
    let params = new HttpParams().set('limit', String(limit));
    if (query.trim()) params = params.set('q', query.trim());
    return this.http.get<{ total: number; tasks: AdminTrashTask[] }>(`${this.baseUrl}/trash/tasks`, { params });
  }

  restoreTrashTask(taskId: string): Observable<{ success: boolean; id: string }> {
    return this.http.post<{ success: boolean; id: string }>(`${this.baseUrl}/trash/tasks/${encodeURIComponent(taskId)}/restore`, {});
  }

  purgeTrashTask(taskId: string): Observable<{ success: boolean; id: string }> {
    return this.http.delete<{ success: boolean; id: string }>(`${this.baseUrl}/trash/tasks/${encodeURIComponent(taskId)}`);
  }

  getMigrations(): Observable<{ total: number; migrations: AdminMigration[] }> {
    return this.http.get<{ total: number; migrations: AdminMigration[] }>(`${this.baseUrl}/migrations`);
  }

  transferOwnership(payload: { resourceType: string; resourceId: string; newOwnerId: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/ownership/transfer`, payload);
  }

  getPendingInvitations(): Observable<AdminPendingInvitations> {
    return this.http.get<AdminPendingInvitations>(`${this.baseUrl}/invitations/pending`);
  }

  cancelInvitation(type: 'calendar' | 'team', inviteId: string): Observable<{ success: boolean; id: string }> {
    return this.http.delete<{ success: boolean; id: string }>(`${this.baseUrl}/invitations/${type}/${encodeURIComponent(inviteId)}`);
  }

  getAuditLogs(action = '', limit = 80): Observable<{ total: number; logs: AdminAuditLog[] }> {
    let params = new HttpParams().set('limit', String(limit));
    if (action.trim()) params = params.set('action', action.trim());
    return this.http.get<{ total: number; logs: AdminAuditLog[] }>(`${this.baseUrl}/audit-logs`, { params });
  }

  getRecentServerLogs(level = 'all', limit = 100): Observable<{ total: number; entries: AdminServerLog[] }> {
    const params = new HttpParams().set('level', level).set('limit', String(limit));
    return this.http.get<{ total: number; entries: AdminServerLog[] }>(`${this.baseUrl}/logs/recent`, { params });
  }

  getLgpdReport(): Observable<any> {
    return this.http.get(`${this.baseUrl}/reports/lgpd`);
  }
}
