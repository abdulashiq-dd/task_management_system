import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import {
  ExportListResponse,
  QueuedJobResponse,
  TaskExport,
} from '../../../core/models/export.model';
import { ExportService } from '../../../core/services/export.service';
import { ReportsComponent } from './reports.component';

describe('ReportsComponent', () => {
  let component: ReportsComponent;
  let fixture: ComponentFixture<ReportsComponent>;
  let exportService: {
    list: ReturnType<typeof vi.fn>;
    queue: ReturnType<typeof vi.fn>;
    generateReport: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
  };

  const taskReport: TaskExport = {
    id: 'export-123',
    userId: 'user-123',
    backgroundJobId: 'job-123',
    type: 'reports',
    fileName: 'task-report.json',
    mimeType: 'application/json',
    size: 1024,
    totalRecords: 4,
    status: 'completed',
    filters: {},
    error: null,
    isDownloadable: true,
    downloadUrl: '/api/exports/export-123/download',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    completedAt: '2026-01-01T10:01:00.000Z',
    failedAt: null,
  };

  const listResponse: ExportListResponse = {
    success: true,
    message: 'Exports fetched successfully',
    count: 1,
    exports: [taskReport],
    pagination: {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };

  const queuedResponse: QueuedJobResponse = {
    success: true,
    message: 'Export job queued successfully',
    exportId: 'export-456',
    statusUrl: '/api/jobs/job-456',
    exportUrl: '/api/exports/export-456',
    job: {
      id: 'job-456',
      type: 'csvExport',
      userId: 'user-123',
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      retryCount: 0,
      maxRetries: 3,
      retryDelay: 1000,
      nextRetryAt: null,
      isPermanentlyFailed: false,
      createdAt: '2026-01-01T10:00:00.000Z',
      startedAt: null,
      lastAttemptAt: null,
      completedAt: null,
      failedAt: null,
    },
  };

  beforeEach(async () => {
    exportService = {
      list: vi.fn(() => of(listResponse)),
      queue: vi.fn(() => of(queuedResponse)),
      generateReport: vi.fn(() => of(queuedResponse)),
      download: vi.fn(() => of(new Blob(['{}'], { type: 'application/json' }))),
    };

    await TestBed.configureTestingModule({
      imports: [ReportsComponent],
      providers: [{ provide: ExportService, useValue: exportService }],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads and displays generated reports from the API', () => {
    expect(exportService.list).toHaveBeenCalledWith(undefined, undefined, 1, 10);
    expect(fixture.nativeElement.textContent).toContain('Task summary report');
    expect(fixture.nativeElement.textContent).toContain('task-report.json');
    expect(fixture.nativeElement.textContent).toContain('Download');
  });

  it('uses the backend report type when filtering export history', () => {
    const typeSelect = fixture.nativeElement.querySelector(
      '.history-filter select',
    ) as HTMLSelectElement;
    typeSelect.value = 'reports';
    typeSelect.dispatchEvent(new Event('change'));

    expect(exportService.list).toHaveBeenLastCalledWith('reports', undefined, 1, 10);
  });

  it('queues a CSV export with the selected task filters', () => {
    const statusSelect = fixture.nativeElement.querySelector(
      '.filter-grid select',
    ) as HTMLSelectElement;
    statusSelect.value = 'completed';
    statusSelect.dispatchEvent(new Event('change'));

    const searchInput = fixture.nativeElement.querySelector(
      '.filter-grid input[type="search"]',
    ) as HTMLInputElement;
    searchInput.value = '  release notes  ';
    searchInput.dispatchEvent(new Event('input'));

    component.queueExport('csv');

    expect(exportService.queue).toHaveBeenCalledWith('csv', {
      status: 'completed',
      search: 'release notes',
    });
    expect(component.actionMessage()).toContain('CSV export is queued');
  });

  it('blocks invalid export date ranges but still allows an unfiltered summary report', () => {
    const dateInputs = fixture.nativeElement.querySelectorAll(
      '.filter-grid input[type="date"]',
    ) as NodeListOf<HTMLInputElement>;
    dateInputs[0].value = '2026-02-01';
    dateInputs[0].dispatchEvent(new Event('change'));
    dateInputs[1].value = '2026-01-01';
    dateInputs[1].dispatchEvent(new Event('change'));

    expect(component.dateRangeInvalid).toBe(true);

    component.queueExport('csv');
    expect(exportService.queue).not.toHaveBeenCalled();

    component.generateReport();
    expect(exportService.generateReport).toHaveBeenCalledWith('taskSummary');
  });
});
