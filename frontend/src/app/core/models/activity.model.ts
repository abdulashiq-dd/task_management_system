import { Pagination } from './pagination.model';

export type ActivityEventType = 'taskCreated' | 'taskUpdated' | 'taskAssigned' | 'taskCompleted';

export interface TaskActivity {
  _id: string;
  task: string;
  taskTitle: string;
  eventType: ActivityEventType;
  performedBy: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityListResponse {
  success: boolean;
  message: string;
  count: number;
  activities: TaskActivity[];
  pagination: Pagination;
}
