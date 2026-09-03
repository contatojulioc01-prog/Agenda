import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Attachment, AttachmentOwner } from '../models/attachment.model';

@Injectable({ providedIn: 'root' })
export class AttachmentsService {
  private readonly http = inject(HttpClient);

  upload(ownerType: AttachmentOwner, ownerId: string, file: File, userId: string): Observable<Attachment> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/octet-stream',
      'x-user-id': userId,
      'x-file-name': encodeURIComponent(file.name),
      'x-file-type': file.type || 'application/octet-stream',
    });
    return this.http.post<Attachment>(`/api/attachments/${ownerType}/${ownerId}`, file, { headers });
  }

  remove(attachmentId: string, userId: string): Observable<unknown> {
    return this.http.delete(`/api/attachments/${attachmentId}`, { headers: { 'x-user-id': userId } });
  }

  content(attachmentId: string, userId: string): Observable<Blob> {
    return this.http.get(`/api/attachments/${attachmentId}/content`, {
      headers: { 'x-user-id': userId }, responseType: 'blob',
    });
  }

  download(attachment: Attachment, userId: string): void {
    this.content(attachment.id, userId).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
}
