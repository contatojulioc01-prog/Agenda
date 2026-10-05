import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MuralBoard, MuralBoardSummary, MuralGroup, MuralItem, MuralItemInput } from '../../../core/models/mural.model';

@Injectable({ providedIn: 'root' })
export class MuralBoardApiService {
  private http = inject(HttpClient);

  obterMurais(userId: string): Observable<MuralBoardSummary[]> {
    return this.http.get<MuralBoardSummary[]>('/api/mural/boards', {
      headers: { 'x-user-id': userId }
    });
  }

  obterMural(muralId: string, userId: string): Observable<{ board: MuralBoardSummary; groups: MuralGroup[]; items: MuralItem[]; teamMembers: any[] }> {
    return this.http.get<{ board: MuralBoardSummary; groups: MuralGroup[]; items: MuralItem[]; teamMembers: any[] }>(
      `/api/mural/boards/${muralId}`,
      { headers: { 'x-user-id': userId } }
    );
  }

  salvarMural(dados: { name: string; description?: string; color?: string; scopeType?: string; teamId?: string | null }, userId: string): Observable<MuralBoardSummary> {
    return this.http.post<MuralBoardSummary>('/api/mural/boards', dados, {
      headers: { 'x-user-id': userId }
    });
  }

  atualizarMural(muralId: string, dados: Partial<MuralBoardSummary>, userId: string): Observable<MuralBoardSummary> {
    return this.http.put<MuralBoardSummary>(`/api/mural/boards/${muralId}`, dados, {
      headers: { 'x-user-id': userId }
    });
  }

  excluirMural(muralId: string, userId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/mural/boards/${muralId}`, {
      headers: { 'x-user-id': userId }
    });
  }

  salvarGrupo(muralId: string, dados: { title: string; color?: string }, userId: string): Observable<MuralGroup> {
    return this.http.post<MuralGroup>(`/api/mural/boards/${muralId}/groups`, dados, {
      headers: { 'x-user-id': userId }
    });
  }

  atualizarGrupo(groupId: string, dados: Partial<MuralGroup>, userId: string): Observable<MuralGroup> {
    return this.http.put<MuralGroup>(`/api/mural/groups/${groupId}`, dados, {
      headers: { 'x-user-id': userId }
    });
  }

  excluirGrupo(groupId: string, userId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/mural/groups/${groupId}`, {
      headers: { 'x-user-id': userId }
    });
  }

  alternarFixacao(itemId: string, isPinned: boolean, userId: string): Observable<MuralItem> {
    return this.http.put<MuralItem>(`/api/mural/items/${itemId}`, { isPinned }, {
      headers: { 'x-user-id': userId }
    });
  }

  moverItemParaGrupo(itemId: string, groupId: string | null, userId: string): Observable<MuralItem> {
    return this.http.put<MuralItem>(`/api/mural/items/${itemId}`, { groupId }, {
      headers: { 'x-user-id': userId }
    });
  }

  adicionarMembroTime(teamId: string, userId: string, role: 'member' | 'admin', requesterId: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`/api/mural/teams/${teamId}/members`, { userId, role }, {
      headers: { 'x-user-id': requesterId }
    });
  }

  removerMembroTime(teamId: string, userId: string, requesterId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/mural/teams/${teamId}/members/${userId}`, {
      headers: { 'x-user-id': requesterId }
    });
  }
}
