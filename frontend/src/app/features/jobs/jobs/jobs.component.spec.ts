import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { BackgroundJob, JobListResponse, JobStats } from '../../../core/models/job.model';
import { JobService } from '../../../core/services/job.service';
import { JobsComponent } from './jobs.component';

describe('JobsComponent', () => {
  let component: JobsComponent;
  let fixture: ComponentFixture<JobsComponent>;
  let jobService: {
    list: ReturnType<typeof vi.fn>;
    stats: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
  };

  const job: BackgroundJob = {
    id: 'job-123',
    type: 'csvExport',
    userId: 'user-123',
    status: 'completed',
    attempts: 2,
    maxAttempts: 4,
    retryCount: 1,
    maxRetries: 3,
    retryDelay: 1000,
    nextRetryAt: null,
    isPermanentlyFailed: false,
    createdAt: '2026-01-01T10:00:00.000Z',
    startedAt: '2026-01-01T10:00:01.000Z',
    lastAttemptAt: '2026-01-01T10:00:05.000Z',
    completedAt: '2026-01-01T10:00:06.000Z',
    failedAt: null,
  };

  const listResponse: JobListResponse = {
    success: true,
    message: 'Jobs fetched successfully',
    count: 1,
    jobs: [job],
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };

  const stats: JobStats = {
    queue: {
      pending: 2,
      processing: 1,
      retrying: 1,
      completed: 8,
      failed: 1,
    },
    retries: {
      totalAttempts: 15,
      totalRetriesScheduled: 4,
      totalRetryAttempts: 4,
      failedAttempts: 4,
      retriedJobs: 3,
      recoveredJobs: 2,
      permanentlyFailedJobs: 1,
      awaitingRetry: 1,
    },
  };

  beforeEach(async () => {
    jobService = {
      list: vi.fn(() => of(listResponse)),
      stats: vi.fn(() => of({ success: true, message: 'Stats fetched', stats })),
      getById: vi.fn(() =>
        of({
          success: true,
          message: 'Job fetched successfully',
          job: {
            ...job,
            errorHistory: [
              {
                attempt: 1,
                message: 'Job attempt failed',
                timestamp: '2026-01-01T10:00:02.000Z',
                retryable: true,
              },
            ],
            result: { exportId: 'export-123', totalRecords: 6 },
          },
        }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [JobsComponent],
      providers: [{ provide: JobService, useValue: jobService }],
    }).compileComponents();

    fixture = TestBed.createComponent(JobsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads job history and queue statistics', () => {
    expect(jobService.list).toHaveBeenCalledWith(undefined, undefined, 1, 20);
    expect(jobService.stats).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('CSV export');
    expect(fixture.nativeElement.textContent).toContain('2');
    expect(fixture.nativeElement.textContent).toContain('Automatic retries');
  });

  it('filters jobs by status and type', () => {
    const statusSelect = fixture.nativeElement.querySelector(
      '[aria-label="Filter jobs by status"]',
    ) as HTMLSelectElement;
    statusSelect.value = 'failed';
    statusSelect.dispatchEvent(new Event('change'));

    const typeSelect = fixture.nativeElement.querySelector(
      '[aria-label="Filter jobs by type"]',
    ) as HTMLSelectElement;
    typeSelect.value = 'csvExport';
    typeSelect.dispatchEvent(new Event('change'));

    expect(jobService.list).toHaveBeenLastCalledWith('failed', 'csvExport', 1, 20);
  });

  it('loads sanitized job details when a row is expanded', () => {
    component.toggleDetails(job.id);
    fixture.detectChanges();

    expect(jobService.getById).toHaveBeenCalledWith(job.id);
    expect(fixture.nativeElement.textContent).toContain('Attempt history');
    expect(fixture.nativeElement.textContent).toContain('exportId');
  });
});
