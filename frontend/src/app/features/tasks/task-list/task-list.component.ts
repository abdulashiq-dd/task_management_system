import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  switchMap,
  tap,
} from 'rxjs';

import { Task, TaskListQuery, TaskPriority, TaskStatus } from '../../../core/models/task.model';
import { AuthService } from '../../../core/services/auth.service';
import { TaskService } from '../../../core/services/task.service';
import { getHttpErrorMessage } from '../../../shared/utils/http-error.utils';

@Component({
  imports: [RouterLink],
  selector: 'app-task-list',
  styleUrl: './task-list.component.scss',
  templateUrl: './task-list.component.html',
})
export class TaskListComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly authService = inject(AuthService);
  private readonly taskService = inject(TaskService);
  private readonly loadRequests = new Subject<TaskListQuery>();
  private readonly searchChanges = new Subject<string>();

  readonly tasks = signal<Task[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly actionError = signal('');
  readonly actionTaskId = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly statusFilter = signal<TaskStatus | ''>('');
  readonly priorityFilter = signal<TaskPriority | ''>('');
  readonly currentPage = signal(1);
  readonly totalTasks = signal(0);
  readonly totalPages = signal(0);
  readonly hasActiveFilters = computed(() =>
    Boolean(this.searchTerm().trim() || this.statusFilter() || this.priorityFilter()),
  );
  readonly pageSize = 10;

  constructor() {
    this.loadRequests
      .pipe(
        switchMap((query) => {
          this.loading.set(true);
          this.errorMessage.set('');
          return this.taskService.list(query).pipe(
            tap((response) => {
              this.tasks.set(response.tasks);
              this.totalTasks.set(response.totalTasks);
              this.totalPages.set(response.totalPages);
              this.currentPage.set(response.currentPage);
            }),
            catchError((error: unknown) => {
              this.tasks.set([]);
              this.totalTasks.set(0);
              this.totalPages.set(0);
              this.errorMessage.set(
                getHttpErrorMessage(error, 'Could not load tasks. Please try again.'),
              );
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.searchChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadTasks(1));

    this.loadTasks(1);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
    this.searchChanges.next(value);
  }

  onStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.statusFilter.set(this.isTaskStatus(value) ? value : '');
    this.loadTasks(1);
  }

  onPriorityChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.priorityFilter.set(this.isTaskPriority(value) ? value : '');
    this.loadTasks(1);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.statusFilter.set('');
    this.priorityFilter.set('');
    this.loadTasks(1);
  }

  loadTasks(page = this.currentPage()): void {
    const search = this.searchTerm().trim();
    this.currentPage.set(page);
    this.actionError.set('');
    this.loadRequests.next({
      page,
      limit: this.pageSize,
      sortBy: 'createdAt',
      order: 'desc',
      search: search || undefined,
      status: this.statusFilter() || undefined,
      priority: this.priorityFilter() || undefined,
    });
  }

  markCompleted(task: Task): void {
    this.runTaskAction(task._id, this.taskService.update(task._id, { status: 'completed' }));
  }

  deleteTask(task: Task): void {
    const confirmed = this.document.defaultView?.confirm(`Delete "${task.title}"?`);
    if (!confirmed) return;

    const page =
      this.tasks().length === 1 && this.currentPage() > 1
        ? this.currentPage() - 1
        : this.currentPage();
    this.runTaskAction(task._id, this.taskService.delete(task._id), page);
  }

  statusLabel(status: TaskStatus): string {
    return {
      pending: 'Pending',
      in_progress: 'In progress',
      completed: 'Completed',
    }[status];
  }

  canManageTask(task: Task): boolean {
    const user = this.authService.currentUser();
    return Boolean(user && (user.role === 'admin' || task.createdBy === user.id));
  }

  taskAccessLabel(task: Task): string {
    return task.assignedTo === this.authService.currentUser()?.id
      ? 'Assigned to you · view only'
      : 'View only';
  }

  formatDueDate(dueDate: string | null): string {
    return dueDate
      ? new Date(dueDate).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        })
      : 'No due date';
  }

  private runTaskAction(
    taskId: string,
    request: Observable<Task>,
    page = this.currentPage(),
  ): void {
    this.actionTaskId.set(taskId);
    this.actionError.set('');
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.actionTaskId.set(null);
        this.loadTasks(page);
      },
      error: (error: unknown) => {
        this.actionTaskId.set(null);
        this.actionError.set(
          getHttpErrorMessage(error, 'Could not update this task. Please try again.'),
        );
      },
    });
  }

  private isTaskStatus(value: string): value is TaskStatus {
    return value === 'pending' || value === 'in_progress' || value === 'completed';
  }

  private isTaskPriority(value: string): value is TaskPriority {
    return value === 'low' || value === 'medium' || value === 'high';
  }
}
