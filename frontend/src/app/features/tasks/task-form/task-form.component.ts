import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { TaskCreateRequest, TaskPriority, TaskStatus } from '../../../core/models/task.model';
import { TaskService } from '../../../core/services/task.service';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceUser } from '../../../core/models/auth.model';
import { getHttpErrorMessage } from '../../../shared/utils/http-error.utils';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-task-form',
  styleUrl: './task-form.component.scss',
  templateUrl: './task-form.component.html',
})
export class TaskFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly taskService = inject(TaskService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly taskId = this.route.snapshot.paramMap.get('id');
  readonly isEditMode = computed(() => this.taskId !== null);
  readonly submitting = signal(false);
  readonly loading = signal(this.isEditMode());
  readonly errorMessage = signal('');
  readonly users = signal<WorkspaceUser[]>([]);
  readonly usersLoading = signal(false);
  readonly selectedUserIds = signal<string[]>([]);
  readonly isAdmin = this.authService.isAdmin;

  readonly taskForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)]],
    description: ['', Validators.maxLength(2000)],
    status: ['pending' as TaskStatus],
    priority: ['medium' as TaskPriority],
    dueDate: [''],
    tags: [''],
    assignmentType: ['person' as 'person' | 'group'],
    assignee: [''],
  });

  constructor() {
    if (this.isAdmin()) {
      this.loadUsers();
    }
    if (this.taskId) {
      this.loadTask(this.taskId);
    }
  }

  submit(): void {
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }

    const values = this.taskForm.getRawValue();
    const request: TaskCreateRequest = {
      title: values.title.trim(),
      description: values.description.trim(),
      status: values.status,
      priority: values.priority,
      dueDate: values.dueDate || null,
      tags: [
        ...new Set(
          values.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ],
    };

    if (!this.taskId && this.isAdmin()) {
      if (values.assignmentType === 'person') {
        if (values.assignee) request.assignedTo = values.assignee;
      } else {
        const selectedIds = new Set(this.selectedUserIds());
        const targets = this.users().filter((user) => selectedIds.has(user._id));

        if (targets.length === 0) {
          this.errorMessage.set('Select at least one person to create this group task.');
          return;
        }

        this.submitting.set(true);
        this.errorMessage.set('');
        forkJoin(
          targets.map((user) => this.taskService.create({ ...request, assignedTo: user._id })),
        )
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.submitting.set(false);
              void this.router.navigate(['/tasks']);
            },
            error: (error: unknown) => {
              this.submitting.set(false);
              this.errorMessage.set(
                getHttpErrorMessage(error, 'Could not assign and create the tasks.'),
              );
            },
          });
        return;
      }
    }

    this.submitting.set(true);
    this.errorMessage.set('');

    const saveTask = this.taskId
      ? this.taskService.update(this.taskId, request)
      : this.taskService.create(request);

    saveTask.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigate(['/tasks']);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(
          getHttpErrorMessage(error, 'Could not save the task. Please try again.'),
        );
      },
    });
  }

  toggleCandidate(userId: string): void {
    this.selectedUserIds.update((selected) =>
      selected.includes(userId)
        ? selected.filter((id) => id !== userId)
        : [...selected, userId],
    );
  }

  toggleAllCandidates(): void {
    const allUserIds = this.users().map((user) => user._id);
    const allSelected =
      allUserIds.length > 0 && allUserIds.every((userId) => this.selectedUserIds().includes(userId));

    this.selectedUserIds.set(allSelected ? [] : allUserIds);
  }

  private loadUsers(): void {
    this.usersLoading.set(true);
    this.authService
      .listUsers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.users.set(response.users);
          this.usersLoading.set(false);
        },
        error: (error: unknown) => {
          this.usersLoading.set(false);
          this.errorMessage.set(
            getHttpErrorMessage(error, 'Could not load workspace users for assignment.'),
          );
        },
      });
  }

  private loadTask(id: string): void {
    this.taskService
      .getById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (task) => {
          this.taskForm.patchValue({
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate?.slice(0, 10) ?? '',
            tags: task.tags.join(', '),
          });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(
            getHttpErrorMessage(
              error,
              'Could not load this task. Please return to the task list and try again.',
            ),
          );
        },
      });
  }
}
