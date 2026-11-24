import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { DashboardService } from '../../../core/services/dashboard.service';
import {
  DashboardActivity,
  DashboardStats,
  TaskPriority,
} from '../../../core/models/dashboard.model';

@Component({
  imports: [DatePipe, RouterLink, TitleCasePipe],
  selector: 'app-user-dashboard',
  styleUrl: './user-dashboard.component.scss',
  templateUrl: './user-dashboard.component.html',
})
export class UserDashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);

  readonly user = this.authService.currentUser;
  readonly stats = signal<DashboardStats | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly priorities: TaskPriority[] = ['high', 'medium', 'low'];
  readonly completionRate = computed(() => {
    const stats = this.stats();
    return stats?.totalTasks ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;
  });
  readonly openTasks = computed(() => {
    const stats = this.stats();
    return stats ? stats.totalTasks - stats.completedTasks : 0;
  });

  ngOnInit(): void {
    this.loadDashboard();
  }

  loadDashboard(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.dashboardService.getDashboard().subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(
          error.error?.message || 'We could not load your dashboard. Please try again.',
        );
        this.loading.set(false);
      },
    });
  }

  activityLabel(activity: DashboardActivity): string {
    const labels: Record<DashboardActivity['eventType'], string> = {
      taskCreated: 'created a task',
      taskUpdated: 'updated a task',
      taskAssigned: 'assigned a task',
      taskCompleted: 'completed a task',
    };

    return labels[activity.eventType];
  }

  priorityWidth(priority: TaskPriority): number {
    const stats = this.stats();
    const count = stats?.tasksByPriority[priority] ?? 0;
    return stats?.totalTasks ? (count / stats.totalTasks) * 100 : 0;
  }
}
