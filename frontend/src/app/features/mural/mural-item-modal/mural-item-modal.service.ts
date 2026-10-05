import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MuralItem, MuralItemInput } from '../../../core/models/mural.model';
import { Attachment } from '../../../core/models/attachment.model';

@Injectable({ providedIn: 'root' })
export class MuralItemModalService {
  private http = inject(HttpClient);

  salvarItem(boardId: string, item: MuralItemInput, userId: string): Observable<MuralItem> {
    return this.http.post<MuralItem>(`/api/mural/boards/${boardId}/items`, item, {
      headers: { 'x-user-id': userId }
    });
  }

  atualizarItem(itemId: string, item: Partial<MuralItem>, userId: string): Observable<MuralItem> {
    return this.http.put<MuralItem>(`/api/mural/items/${itemId}`, item, {
      headers: { 'x-user-id': userId }
    });
  }

  excluirItem(itemId: string, userId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/mural/items/${itemId}`, {
      headers: { 'x-user-id': userId }
    });
  }
}
