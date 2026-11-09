import { Attachment } from './attachment.model';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ActivityComment {
  id: string;
  entityType: 'task' | 'mural_item' | 'event';
  entityId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  mentions?: string[];
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  entityType: 'task' | 'mural_item' | 'event';
  entityId: string;
  userId: string;
  userName: string;
  action: string;
  changes?: Record<string, any>;
  createdAt: string;
}

export interface KanbanBoardSummary {
  id: string;
  name: string;
  description: string;
  color: string;
  owner_id: string;
  task_count?: number;
  taskCount?: number;
  trashCount?: number;
  scopeType: 'personal' | 'team';
  teamId: string | null;
  teamName?: string;
  myRole?: 'admin' | 'member';
}

export interface KanbanColumn {
  id: string;
  board_id: string;
  title: string;
  color: string;
  position: number;
  autoArchiveDelay?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  groupTitle?: string;
}

export interface KanbanTask {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  position: number;
  priority: TaskPriority;
  dueDate: string | null;
  labels: string[];
  assigneeId: string | null;
  assigneeIds: string[];
  checklist: ChecklistItem[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
  parentTaskId: string | null;
  attachments: Attachment[];
}

export interface KanbanBoard extends KanbanBoardSummary {
  columns: KanbanColumn[];
  tasks: KanbanTask[];
}

export type KanbanTaskInput = Pick<KanbanTask, 'title' | 'description' | 'columnId' | 'priority' | 'dueDate' | 'labels' | 'assigneeIds' | 'checklist' | 'parentTaskId'>;

export interface KanbanTeam {
  id: string;
  name: string;
  description: string;
  color: string;
  owner_id: string;
  myRole: 'admin' | 'member';
  memberCount: number;
  boardId: string;
}

export interface KanbanTeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
}

export interface KanbanTeamInvitation {
  id: string;
  team_id: string;
  user_id: string;
  invited_by: string;
  team_name: string;
  team_color: string;
}
