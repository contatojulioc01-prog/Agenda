export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  previewable: boolean;
  createdAt: string;
}

export type AttachmentOwner = 'event' | 'task';
