import { Attachment } from './attachment.model';
import { KanbanTeamMember } from './kanban.model';

export interface MuralBoardSummary {
  id: string;
  name: string;
  description: string;
  color: string;
  owner_id: string;
  scopeType: 'personal' | 'team';
  teamId: string | null;
  teamName?: string;
  myRole?: 'admin' | 'member';
  itemCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MuralGroup {
  id: string;
  muralId: string;
  title: string;
  color: string;
  position: number;
  createdAt: string;
}

export interface MuralItem {
  id: string;
  muralId: string;
  groupId: string | null;
  title: string;
  content: string;
  color: string;
  isPinned: boolean;
  position: number;
  rotation: number;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
}

export interface MuralBoard extends MuralBoardSummary {
  groups: MuralGroup[];
  items: MuralItem[];
  teamMembers?: KanbanTeamMember[];
}

export interface MuralItemInput {
  title: string;
  content: string;
  color: string;
  groupId: string | null;
  isPinned: boolean;
  rotation?: number;
  createdByName?: string;
}
