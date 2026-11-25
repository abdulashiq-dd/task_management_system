import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AppNotification, NotificationListResponse } from '../../../core/models/notification.model';
import { NotificationService } from '../../../core/services/notification.service';
import { NotificationsComponent } from './notifications.component';

describe('NotificationsComponent', () => {
  let component: NotificationsComponent;
  let fixture: ComponentFixture<NotificationsComponent>;
  let notificationService: {
    list: ReturnType<typeof vi.fn>;
    markAsRead: ReturnType<typeof vi.fn>;
    markAllAsRead: ReturnType<typeof vi.fn>;
  };

  const notification: AppNotification = {
    _id: 'notification-123',
    user: 'user-123',
    task: 'task-123',
    type: 'taskAssigned',
    message: 'A new task was assigned to you.',
    isRead: false,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
  };

  const response: NotificationListResponse = {
    message: 'Notifications fetched successfully',
    count: 1,
    notifications: [notification],
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };

  beforeEach(async () => {
    notificationService = {
      list: vi.fn(() => of(response)),
      markAsRead: vi.fn(() => of({})),
      markAllAsRead: vi.fn(() =>
        of({ message: 'All notifications marked as read', modifiedCount: 1 }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads and displays notifications from the API', () => {
    expect(notificationService.list).toHaveBeenCalledWith(1, 20, undefined);
    expect(fixture.nativeElement.textContent).toContain(notification.message);
    expect(fixture.nativeElement.textContent).toContain('Task assigned');
    expect(component.unreadCount()).toBe(1);
  });

  it('loads unread notifications through the unread API filter', () => {
    component.loadNotifications(1, 'unread');

    expect(notificationService.list).toHaveBeenLastCalledWith(1, 20, false);
    expect(component.filter()).toBe('unread');
  });

  it('marks a notification as read and refreshes the current list', () => {
    component.markAsRead(notification);

    expect(notificationService.markAsRead).toHaveBeenCalledWith(notification._id);
    expect(notificationService.list).toHaveBeenCalledTimes(2);
  });

  it('marks all notifications as read', () => {
    component.markAllAsRead();

    expect(notificationService.markAllAsRead).toHaveBeenCalledTimes(1);
    expect(notificationService.list).toHaveBeenCalledTimes(2);
  });
});
