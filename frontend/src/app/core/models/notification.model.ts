import { Pagination } from './pagination.model';

export type NotificationType =
  | 'taskAssigned'
  | 'taskCompleted'
  | 'priorityChanged'
  | 'taskReminder'
  | 'taskOverdue';

export interface AppNotification {
  _id: string;
  user: string;
  task: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  reminderDueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListResponse {
  message: string;
  count: number;
  notifications: AppNotification[];
  pagination: Pagination;
}
