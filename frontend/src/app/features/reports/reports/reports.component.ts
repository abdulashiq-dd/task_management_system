import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Observable,
  Subject,
  Subscription,
  catchError,
  finalize,
  interval,
  switchMap,
  takeWhile,
  tap,
} from 'rxjs';

import {
  ExportStatus,
  ExportType,
  QueuedJobResponse,
  TaskExport,
} from '../../../core/models/export.model';
import { TaskPriority, TaskStatus } from '../../../core/models/task.model';
import { ExportService } from '../../../core/services/export.service';
import { getHttpErrorMessage } from '../../../shared/utils/http-error.utils';

interface ExportFilters {
  status: TaskStatus | '';
  priority: TaskPriority | '';
  search: string;
  tag: string;
  fromDate: string;
  toDate: string;
}

interface ExportListRequest {
  page: number;
  type: ExportType | '';
}

const ACTIVE_EXPORT_STATUSES: ExportStatus[] = ['pending', 'processing', 'retrying'];

@Component({
  imports: [DatePipe],
  selector: 'app-reports',
  styleUrl: './reports.component.scss',
  templateUrl: './reports.component.html',
})
export class ReportsComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly exportService = inject(ExportService);
  private readonly loadRequests = new Subject<ExportListRequest>();
  private pollingSubscription: Subscription | null = null;

  readonly exports = signal<TaskExport[]>([]);
  readonly filters = signal<ExportFilters>({
    status: '',
    priority: '',
    search: '',
    tag: '',
    fromDate: '',
    toDate: '',
  });
  readonly loading = signal(true);
  readonly exporting = signal<ExportType | null>(null);
  readonly downloadingId = signal('');
  readonly errorMessage = signal('');
  readonly actionMessage = signal('');
  readonly currentPage = signal(1);
  readonly totalPages = signal(0);
  readonly totalExports = signal(0);
  readonly historyType = signal<ExportType | ''>('');
  readonly pageSize = 10;

  constructor() {
    this.loadRequests
      .pipe(
        switchMap(({ page, type }) => {
          this.stopPolling();
          this.loading.set(true);
          this.errorMessage.set('');
          return this.exportService.list(type || undefined, undefined, page, this.pageSize).pipe(
            tap((response) => {
              this.updateExportList(response);
              if (this.hasActiveExports(response.exports)) this.startPolling();
            }),
            catchError((error: unknown) => {
              this.errorMessage.set(
                getHttpErrorMessage(error, 'Could not load export history. Please try again.'),
              );
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.loadExports();
  }

  loadExports(page = this.currentPage(), type = this.historyType()): void {
    this.currentPage.set(page);
    this.historyType.set(type);
    this.loadRequests.next({ page, type });
  }

  onHistoryTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.loadExports(1, this.isExportType(value) ? value : '');
  }

  setSelectFilter(key: 'status' | 'priority', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.filters.update((filters) => ({
      ...filters,
      [key]: value,
    }));
  }

  setTextFilter(key: 'search' | 'tag', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.filters.update((filters) => ({
      ...filters,
      [key]: value,
    }));
  }

  setDateFilter(key: 'fromDate' | 'toDate', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.filters.update((filters) => ({
      ...filters,
      [key]: value,
    }));
  }

  clearFilters(): void {
    this.filters.set({
      status: '',
      priority: '',
      search: '',
      tag: '',
      fromDate: '',
      toDate: '',
    });
  }

  get dateRangeInvalid(): boolean {
    const { fromDate, toDate } = this.filters();
    return Boolean(fromDate && toDate && fromDate > toDate);
  }

  queueExport(type: 'csv' | 'json'): void {
    this.queueAction(type, () => this.exportService.queue(type, this.buildFilters()));
  }

  generateReport(): void {
    this.queueAction('reports', () => this.exportService.generateReport('taskSummary'));
  }

  downloadExport(record: TaskExport): void {
    if (!record.isDownloadable || this.downloadingId()) return;

    this.downloadingId.set(record.id);
    this.errorMessage.set('');
    this.exportService
      .download(record.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.downloadingId.set('')),
      )
      .subscribe({
        next: (file) => {
          const url = URL.createObjectURL(file);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = record.fileName;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        error: (error: unknown) => {
          this.errorMessage.set(
            getHttpErrorMessage(error, 'Could not download this file. Please try again.'),
          );
        },
      });
  }

  exportTypeLabel(type: ExportType): string {
    return type === 'reports' ? 'Task summary' : type.toUpperCase();
  }

  statusLabel(status: ExportStatus): string {
    return status === 'retrying' ? 'Retrying' : status.charAt(0).toUpperCase() + status.slice(1);
  }

  formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  private queueAction(type: ExportType, request: () => Observable<QueuedJobResponse>): void {
    if ((type !== 'reports' && this.dateRangeInvalid) || this.exporting()) return;

    this.exporting.set(type);
    this.actionMessage.set('');
    this.errorMessage.set('');
    request()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.exporting.set(null)),
      )
      .subscribe({
        next: () => {
          this.actionMessage.set(
            type === 'reports'
              ? 'Your task summary report is queued. It will be available to download when ready.'
              : `Your ${type.toUpperCase()} export is queued. It will be available to download when ready.`,
          );
          this.loadExports(1, '');
        },
        error: (error: unknown) => {
          this.errorMessage.set(
            getHttpErrorMessage(error, 'Could not start this export. Please try again.'),
          );
        },
      });
  }

  private buildFilters(): Record<string, unknown> {
    const filters = this.filters();
    return {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
      ...(filters.tag.trim() ? { tag: filters.tag.trim() } : {}),
      ...(filters.fromDate ? { fromDate: filters.fromDate } : {}),
      ...(filters.toDate ? { toDate: filters.toDate } : {}),
    };
  }

  private updateExportList(response: {
    exports: TaskExport[];
    pagination: { total: number; totalPages: number; page: number };
  }): void {
    this.exports.set(response.exports);
    this.totalExports.set(response.pagination.total);
    this.totalPages.set(response.pagination.totalPages);
    this.currentPage.set(response.pagination.page);
  }

  private hasActiveExports(records: TaskExport[]): boolean {
    return records.some((record) => ACTIVE_EXPORT_STATUSES.includes(record.status));
  }

  private startPolling(): void {
    if (this.pollingSubscription && !this.pollingSubscription.closed) return;

    this.pollingSubscription = interval(2500)
      .pipe(
        switchMap(() =>
          this.exportService.list(
            this.historyType() || undefined,
            undefined,
            this.currentPage(),
            this.pageSize,
          ),
        ),
        tap((response) => this.updateExportList(response)),
        takeWhile((response) => this.hasActiveExports(response.exports), true),
        catchError((error: unknown) => {
          this.errorMessage.set(
            getHttpErrorMessage(
              error,
              'Could not refresh export status. Use Refresh to try again.',
            ),
          );
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private stopPolling(): void {
    this.pollingSubscription?.unsubscribe();
    this.pollingSubscription = null;
  }

  private isExportType(value: string): value is ExportType {
    return value === 'reports' || value === 'csv' || value === 'json';
  }
}
