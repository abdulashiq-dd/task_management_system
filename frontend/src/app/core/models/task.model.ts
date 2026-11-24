export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  _id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  tags: string[];
  isOverdue: boolean;
  overdueAt: string | null;
  createdBy: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  __v?: number;
}

export interface TaskCreateRequest {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  tags?: string[];
}

export type TaskUpdateRequest = Partial<TaskCreateRequest>;

export interface TaskListQuery {
  status?: TaskStatus;
  priority?: TaskPriority;
  search?: string;
  tag?: string;
  fromDate?: string;
  toDate?: string;
  sortBy?: 'dueDate' | 'priority' | 'createdAt';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface TaskListResponse {
  message: string;
  count: number;
  totalTasks: number;
  totalPages: number;
  currentPage: number;
  tasks: Task[];
}
