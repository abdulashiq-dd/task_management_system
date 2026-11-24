import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { Task } from '../../../core/models/task.model';
import { TaskService } from '../../../core/services/task.service';
import { TaskFormComponent } from './task-form.component';

describe('TaskFormComponent', () => {
  let fixture: ComponentFixture<TaskFormComponent>;
  let component: TaskFormComponent;
  let routeId: string | null;
  let taskService: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
  };
  let router: { navigate: ReturnType<typeof vi.fn> };

  const task: Task = {
    _id: 'task-123',
    title: 'Review release notes',
    description: 'Check the final changes.',
    status: 'pending',
    priority: 'medium',
    dueDate: null,
    tags: [],
    isOverdue: false,
    overdueAt: null,
    createdBy: 'user-123',
    assignedTo: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    routeId = null;
    taskService = {
      create: vi.fn(() => of(task)),
      update: vi.fn(() => of(task)),
      getById: vi.fn(() => of(task)),
    };
    router = { navigate: vi.fn().mockResolvedValue(true) };

    await TestBed.configureTestingModule({
      imports: [TaskFormComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useFactory: () => ({
            snapshot: {
              paramMap: convertToParamMap(routeId ? { id: routeId } : {}),
            },
          }),
        },
        { provide: Router, useValue: router },
        { provide: TaskService, useValue: taskService },
      ],
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(TaskFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('creates a task with trimmed fields and normalized comma-separated tags', () => {
    createComponent();
    component.taskForm.setValue({
      title: '  Plan release  ',
      description: '  Confirm the release checklist.  ',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2026-12-01',
      tags: ' release, planning, release ',
    });

    component.submit();

    expect(taskService.create).toHaveBeenCalledWith({
      title: 'Plan release',
      description: 'Confirm the release checklist.',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2026-12-01',
      tags: ['release', 'planning'],
    });
    expect(router.navigate).toHaveBeenCalledWith(['/tasks']);
  });

  it('marks an empty or whitespace-only title invalid without calling the API', () => {
    createComponent();
    component.taskForm.controls.title.setValue('   ');

    component.submit();

    expect(component.taskForm.controls.title.touched).toBe(true);
    expect(taskService.create).not.toHaveBeenCalled();
  });

  it('loads task values and updates an existing task', () => {
    routeId = 'task-123';
    createComponent();

    expect(taskService.getById).toHaveBeenCalledWith('task-123');
    expect(component.taskForm.controls.title.value).toBe(task.title);
    expect(component.loading()).toBe(false);

    component.taskForm.controls.title.setValue('Updated title');
    component.submit();

    expect(taskService.update).toHaveBeenCalledWith(
      'task-123',
      expect.objectContaining({ title: 'Updated title' }),
    );
    expect(router.navigate).toHaveBeenCalledWith(['/tasks']);
  });
});
