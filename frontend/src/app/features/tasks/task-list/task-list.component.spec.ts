import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Task, TaskListQuery, TaskListResponse } from '../../../core/models/task.model';
import { AuthService } from '../../../core/services/auth.service';
import { TaskService } from '../../../core/services/task.service';
import { TaskListComponent } from './task-list.component';

describe('TaskListComponent', () => {
  let fixture: ComponentFixture<TaskListComponent>;
  let component: TaskListComponent;
  let taskService: {
    list: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let currentUser = { id: 'user-123', role: 'user' };

  const task: Task = {
    _id: 'task-123',
    title: 'Review release notes',
    description: 'Check the final changes.',
    status: 'pending',
    priority: 'high',
    dueDate: '2026-12-01T00:00:00.000Z',
    tags: ['release'],
    isOverdue: false,
    overdueAt: null,
    createdBy: 'user-123',
    assignedTo: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const response: TaskListResponse = {
    message: 'Tasks fetched successfully',
    count: 1,
    totalTasks: 1,
    totalPages: 1,
    currentPage: 1,
    tasks: [task],
  };

  beforeEach(async () => {
    currentUser = { id: 'user-123', role: 'user' };
    taskService = {
      list: vi.fn((query: TaskListQuery) => of({ ...response, currentPage: query.page ?? 1 })),
      update: vi.fn(() => of(task)),
      delete: vi.fn(() => of(task)),
    };

    await TestBed.configureTestingModule({
      imports: [TaskListComponent],
      providers: [
        provideRouter([]),
        { provide: TaskService, useValue: taskService },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => currentUser,
            isAdmin: () => currentUser.role === 'admin',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads and displays tasks from the API', () => {
    expect(taskService.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10, order: 'desc' }),
    );
    expect(fixture.nativeElement.textContent).toContain('Review release notes');
    expect(fixture.nativeElement.textContent).toContain('High priority');
    expect(fixture.nativeElement.textContent).toContain('release');
  });

  it('reloads tasks when a status filter changes', () => {
    const statusSelect = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    statusSelect.value = 'completed';
    statusSelect.dispatchEvent(new Event('change'));

    expect(taskService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, status: 'completed' }),
    );

    component.clearFilters();

    expect(component.hasActiveFilters()).toBe(false);
    expect(taskService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        search: undefined,
        status: undefined,
        priority: undefined,
      }),
    );
  });

  it('marks a task completed and refreshes the current page', () => {
    component.markCompleted(task);

    expect(taskService.update).toHaveBeenCalledWith(task._id, { status: 'completed' });
    expect(taskService.list).toHaveBeenCalledTimes(2);
  });

  it('hides task mutation controls from an assignee who did not create the task', () => {
    const assignedTask = { ...task, createdBy: 'user-456', assignedTo: 'user-123' };
    component.tasks.set([assignedTask]);
    fixture.detectChanges();

    expect(component.canManageTask(assignedTask)).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Assigned to you · view only');
    expect(fixture.nativeElement.querySelector('.task-actions')).toBeNull();
  });

  it('allows admins to manage tasks created by other users', () => {
    const otherUsersTask = { ...task, createdBy: 'user-456' };
    currentUser = { id: 'admin-123', role: 'admin' };

    expect(component.canManageTask(otherUsersTask)).toBe(true);
  });
});
