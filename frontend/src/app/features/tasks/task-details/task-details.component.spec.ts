import { ComponentFixture, TestBed } from '@angular/core/testing';
import { convertToParamMap, provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

import { Task } from '../../../core/models/task.model';
import { AuthService } from '../../../core/services/auth.service';
import { TaskService } from '../../../core/services/task.service';
import { TaskDetailsComponent } from './task-details.component';

describe('TaskDetailsComponent', () => {
  let component: TaskDetailsComponent;
  let fixture: ComponentFixture<TaskDetailsComponent>;
  let taskService: { getById: ReturnType<typeof vi.fn> };

  const task: Task = {
    _id: 'task-123',
    title: 'Review release notes',
    description: 'Check the final changes before publishing.',
    status: 'in_progress',
    priority: 'high',
    dueDate: '2026-12-01T00:00:00.000Z',
    tags: ['release', 'qa'],
    isOverdue: false,
    overdueAt: null,
    createdBy: 'user-123',
    assignedTo: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
  };

  beforeEach(async () => {
    taskService = { getById: vi.fn(() => of(task)) };
    await TestBed.configureTestingModule({
      imports: [TaskDetailsComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: task._id })),
            snapshot: { paramMap: convertToParamMap({ id: task._id }) },
          },
        },
        { provide: TaskService, useValue: taskService },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({ id: 'user-123', role: 'user' }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads and displays task details', () => {
    expect(taskService.getById).toHaveBeenCalledWith(task._id);
    expect(fixture.nativeElement.textContent).toContain(task.title);
    expect(fixture.nativeElement.textContent).toContain('In progress');
    expect(fixture.nativeElement.textContent).toContain('High priority');
    expect(fixture.nativeElement.textContent).toContain(
      'Check the final changes before publishing.',
    );
    expect(fixture.nativeElement.textContent).toContain('release');
  });

  it('shows edit actions only to task creators and admins', () => {
    expect(component.canEdit()).toBe(true);
    expect(fixture.nativeElement.querySelector('.primary-button')).toBeTruthy();
  });
});
