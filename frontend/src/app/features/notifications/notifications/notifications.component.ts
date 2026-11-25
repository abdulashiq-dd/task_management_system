import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, finalize, switchMap, tap } from 'rxjs';

import {
  AppNotification,
  NotificationListResponse,
  NotificationType,
} from '../../../core/models/notification.model';
import { NotificationService } from '../../../core/services/notification.service';
import { getHttpErrorMessage } from '../../../shared/utils/http-error.utils';

type NotificationFilter = 'all' | 'unread';
interface NotificationRequest {
  page: number;
  filter: NotificationFilter;
}

@Component({
  imports: [RouterLink],
  selector: 'app-notifications',
  styleUrl: './notifications.component.scss',
  templateUrl: './notifications.component.html',
})
export class NotificationsComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationService = inject(NotificationService);
  private readonly loadRequests = new Subject<NotificationRequest>();

  readonly notifications = signal<AppNotification[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly actionError = signal('');
  readonly markingNotificationId = signal<string | null>(null);
  readonly markingAll = signal(false);
  readonly filter = signal<NotificationFilter>('all');
  readonly currentPage = signal(1);
  readonly totalNotifications = signal(0);
  readonly totalPages = signal(0);
  readonly unreadCount = computed(
    () => this.notifications().filter((notification) => !notification.isRead).length,
  );
  readonly pageSize = 20;

  constructor() {
    this.loadRequests
      .pipe(
        switchMap(({ page, filter }) => {
          this.loading.set(true);
          this.errorMessage.set('');
          const isRead = filter === 'unread' ? false : undefined;
          return this.notificationService.list(page, this.pageSize, isRead).pipe(
            tap((response) => this.applyResponse(response)),
            catchError((error: unknown) => {
              this.notifications.set([]);
              this.totalNotifications.set(0);
              this.totalPages.set(0);
              this.errorMessage.set(
                getHttpErrorMessage(error, 'Could not load notifications. Please try again.'),
              );
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.loadNotifications(1);
  }

  loadNotifications(page = this.currentPage(), filter = this.filter()): void {
    this.currentPage.set(page);
    this.filter.set(filter);
    this.actionError.set('');
    this.loadRequests.next({ page, filter });
  }

  markAsRead(notification: AppNotification): void {
    if (notification.isRead || this.markingNotificationId() || this.markingAll()) return;

    this.markingNotificationId.set(notification._id);
    this.actionError.set('');
    const page =
      this.filter() === 'unread' && this.notifications().length === 1 && this.currentPage() > 1
        ? this.currentPage() - 1
        : this.currentPage();

    this.notificationService
      .markAsRead(notification._id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.markingNotificationId.set(null);
          this.loadNotifications(page);
        },
        error: (error: unknown) => {
          this.markingNotificationId.set(null);
          this.actionError.set(
            getHttpErrorMessage(error, 'Could not update this notification. Please try again.'),
          );
        },
      });
  }

  markAllAsRead(): void {
    if (this.totalNotifications() === 0 || this.markingNotificationId() || this.markingAll())
      return;

    this.markingAll.set(true);
    this.actionError.set('');
    this.notificationService
      .markAllAsRead()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.markingAll.set(false);
          this.loadNotifications(1, this.filter());
        },
        error: (error: unknown) => {
          this.markingAll.set(false);
          this.actionError.set(
            getHttpErrorMessage(error, 'Could not update notifications. Please try again.'),
          );
        },
      });
  }

  notificationLabel(type: NotificationType): string {
    return {
      taskAssigned: 'Task assigned',
      taskCompleted: 'Task completed',
      priorityChanged: 'Priority changed',
      taskReminder: 'Due soon',
      taskOverdue: 'Task overdue',
    }[type];
  }

  notificationIcon(type: NotificationType): string {
    return {
      taskAssigned: 'pi pi-user-plus',
      taskCompleted: 'pi pi-check-circle',
      priorityChanged: 'pi pi-flag',
      taskReminder: 'pi pi-clock',
      taskOverdue: 'pi pi-exclamation-triangle',
    }[type];
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  private applyResponse(response: NotificationListResponse): void {
    this.notifications.set(response.notifications);
    this.totalNotifications.set(response.pagination.total);
    this.totalPages.set(response.pagination.totalPages);
    this.currentPage.set(response.pagination.page);
  }
}
