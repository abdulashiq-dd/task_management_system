import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { ActivityListResponse, TaskActivity } from '../../../core/models/activity.model';
import { ActivityService } from '../../../core/services/activity.service';
import { AuthService } from '../../../core/services/auth.service';
import { ActivityComponent } from './activity.component';

describe('ActivityComponent', () => {
  let component: ActivityComponent;
  let fixture: ComponentFixture<ActivityComponent>;
  let activityService: { list: ReturnType<typeof vi.fn> };

  const activity: TaskActivity = {
    _id: 'activity-123',
    task: 'task-123',
    taskTitle: 'Prepare release notes',
    eventType: 'taskUpdated',
    performedBy: 'user-123',
    details: {
      previousStatus: 'pending',
      newStatus: 'in_progress',
      updatedFields: ['status'],
    },
    createdAt: '2026-01-01T10:00:00.000Z',
  };

  const response: ActivityListResponse = {
    success: true,
    message: 'Activity fetched successfully',
    count: 1,
    activities: [activity],
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
    activityService = { list: vi.fn(() => of(response)) };
    await TestBed.configureTestingModule({
      imports: [ActivityComponent],
      providers: [
        provideRouter([]),
        { provide: ActivityService, useValue: activityService },
        {
          provide: AuthService,
          useValue: { currentUser: () => ({ id: 'user-123', role: 'user' }) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads and displays activity from the API', () => {
    expect(activityService.list).toHaveBeenCalledWith(1, 20, undefined);
    expect(fixture.nativeElement.textContent).toContain('Prepare release notes');
    expect(fixture.nativeElement.textContent).toContain(
      'Status changed from Pending to In progress',
    );
    expect(component.actorLabel(activity)).toBe('You');
  });

  it('filters activity by event type', () => {
    component.loadActivity(1, 'taskCompleted');

    expect(activityService.list).toHaveBeenLastCalledWith(1, 20, 'taskCompleted');
    expect(component.eventFilter()).toBe('taskCompleted');
  });
});
