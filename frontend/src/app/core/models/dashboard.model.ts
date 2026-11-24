export interface DashboardActivity {
  _id: string;
  task: string;
  eventType: 'taskCreated' | 'taskUpdated' | 'taskAssigned' | 'taskCompleted';
  createdAt: string;
}

export interface DashboardStats {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  tasksByPriority: {
    low: number;
    medium: number;
    high: number;
  };
  recentActivity: DashboardActivity[];
}

export interface DashboardResponse {
  success: boolean;
  message: string;
  dashboard: DashboardStats;
}

export type TaskPriority = keyof DashboardStats['tasksByPriority'];
