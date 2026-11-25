import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, finalize, switchMap, tap } from 'rxjs';

import { ActivityEventType, TaskActivity } from '../../../core/models/activity.model';
import { ActivityService } from '../../../core/services/activity.service';
import { AuthService } from '../../../core/services/auth.service';
import { getHttpErrorMessage } from '../../../shared/utils/http-error.utils';

interface ActivityRequest {
  page: number;
  eventType?: ActivityEventType;
}

@Component({
  imports: [DatePipe, RouterLink],
  selector: 'app-activity',
  styleUrl: './activity.component.scss',
  templateUrl: './activity.component.html',
})
export class ActivityComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly activityService = inject(ActivityService);
  private readonly authService = inject(AuthService);
  private readonly loadRequests = new Subject<ActivityRequest>();

  readonly activities = signal<TaskActivity[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly eventFilter = signal<ActivityEventType | ''>('');
  readonly currentPage = signal(1);
  readonly totalActivities = signal(0);
  readonly totalPages = signal(0);
  readonly pageSize = 20;
  readonly eventTypes: ActivityEventType[] = [
    'taskCreated',
    'taskUpdated',
    'taskAssigned',
    'taskCompleted',
  ];

  constructor() {
    this.loadRequests
      .pipe(
        switchMap(({ page, eventType }) => {
          this.loading.set(true);
          this.errorMessage.set('');
          return this.activityService.list(page, this.pageSize, eventType).pipe(
            tap((response) => {
              this.activities.set(response.activities);
              this.totalActivities.set(response.pagination.total);
              this.totalPages.set(response.pagination.totalPages);
              this.currentPage.set(response.pagination.page);
            }),
            catchError((error: unknown) => {
              this.activities.set([]);
              this.totalActivities.set(0);
              this.totalPages.set(0);
              this.errorMessage.set(
                getHttpErrorMessage(error, 'Could not load activity. Please try again.'),
              );
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.loadActivity(1);
  }

  loadActivity(page = this.currentPage(), eventType = this.eventFilter()): void {
    this.currentPage.set(page);
    this.eventFilter.set(eventType);
    this.loadRequests.next({ page, eventType: eventType || undefined });
  }

  onEventTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.loadActivity(1, this.isActivityEventType(value) ? value : '');
  }

  eventLabel(eventType: ActivityEventType): string {
    return {
      taskCreated: 'Task created',
      taskUpdated: 'Task updated',
      taskAssigned: 'Task assigned',
      taskCompleted: 'Task completed',
    }[eventType];
  }

  eventIcon(eventType: ActivityEventType): string {
    return {
      taskCreated: 'pi pi-plus',
      taskUpdated: 'pi pi-pencil',
      taskAssigned: 'pi pi-user-plus',
      taskCompleted: 'pi pi-check',
    }[eventType];
  }

  actorLabel(activity: TaskActivity): string {
    return activity.performedBy === this.authService.currentUser()?.id ? 'You' : 'A teammate';
  }

  activityDescription(activity: TaskActivity): string {
    const details = activity.details;
    const changes: string[] = [];
    const previousStatus = details['previousStatus'];
    const newStatus = details['newStatus'];
    const previousPriority = details['previousPriority'];
    const newPriority = details['newPriority'];

    if (
      typeof previousStatus === 'string' &&
      typeof newStatus === 'string' &&
      previousStatus !== newStatus
    ) {
      changes.push(
        `Status changed from ${this.titleCase(previousStatus)} to ${this.titleCase(newStatus)}`,
      );
    }
    if (
      typeof previousPriority === 'string' &&
      typeof newPriority === 'string' &&
      previousPriority !== newPriority
    ) {
      changes.push(
        `Priority changed from ${this.titleCase(previousPriority)} to ${this.titleCase(newPriority)}`,
      );
    }
    if (changes.length) return changes.join(' · ');

    switch (activity.eventType) {
      case 'taskCreated':
        return 'Added this task to the workspace';
      case 'taskAssigned':
        return 'Changed the task assignee';
      case 'taskCompleted':
        return 'Marked this task complete';
      case 'taskUpdated': {
        const fields = details['updatedFields'];
        if (Array.isArray(fields)) {
          const names = fields
            .filter((field): field is string => typeof field === 'string')
            .map((field) => this.titleCase(field));
          if (names.length) return `Updated ${names.join(', ')}`;
        }
        return 'Updated this task';
      }
    }
  }

  private isActivityEventType(value: string): value is ActivityEventType {
    return this.eventTypes.some((eventType) => eventType === value);
  }

  private titleCase(value: string): string {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^./, (character) => character.toUpperCase());
  }
}
