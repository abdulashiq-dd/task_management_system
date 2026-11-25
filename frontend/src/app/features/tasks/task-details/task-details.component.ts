import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, finalize, map, switchMap, tap } from 'rxjs';

import { Task } from '../../../core/models/task.model';
import { AuthService } from '../../../core/services/auth.service';
import { TaskService } from '../../../core/services/task.service';
import { getHttpErrorMessage } from '../../../shared/utils/http-error.utils';

@Component({
  imports: [DatePipe, RouterLink],
  selector: 'app-task-details',
  styleUrl: './task-details.component.scss',
  templateUrl: './task-details.component.html',
})
export class TaskDetailsComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly taskService = inject(TaskService);
  private readonly authService = inject(AuthService);
  private readonly loadRequests = new Subject<string>();

  readonly task = signal<Task | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly canEdit = computed(() => {
    const task = this.task();
    const user = this.authService.currentUser();
    return Boolean(task && user && (user.role === 'admin' || task.createdBy === user.id));
  });

  constructor() {
    this.loadRequests
      .pipe(
        switchMap((id) => {
          if (!id) {
            this.task.set(null);
            this.loading.set(false);
            this.errorMessage.set('This task link is missing its ID.');
            return EMPTY;
          }

          this.task.set(null);
          this.loading.set(true);
          this.errorMessage.set('');
          return this.taskService.getById(id).pipe(
            tap((task) => this.task.set(task)),
            catchError((error: unknown) => {
              this.task.set(null);
              this.errorMessage.set(
                getHttpErrorMessage(error, 'Could not load this task. Please try again.'),
              );
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.route.paramMap
      .pipe(
        map((params) => params.get('id') ?? ''),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((id) => this.loadRequests.next(id));
  }

  retry(): void {
    this.loadRequests.next(this.route.snapshot.paramMap.get('id') ?? '');
  }

  statusLabel(status: Task['status']): string {
    return {
      pending: 'Pending',
      in_progress: 'In progress',
      completed: 'Completed',
    }[status];
  }

  priorityLabel(priority: Task['priority']): string {
    return `${priority.charAt(0).toUpperCase()}${priority.slice(1)} priority`;
  }
}
