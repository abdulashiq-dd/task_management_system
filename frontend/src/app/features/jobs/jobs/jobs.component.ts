import { DatePipe, JsonPipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
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
  BackgroundJob,
  JobListResponse,
  JobStats,
  JobStatus,
  JobType,
} from '../../../core/models/job.model';
import { JobService } from '../../../core/services/job.service';
import { getHttpErrorMessage } from '../../../shared/utils/http-error.utils';

interface JobListRequest {
  page: number;
  status: JobStatus | '';
  type: JobType | '';
}

const ACTIVE_JOB_STATUSES: JobStatus[] = ['pending', 'processing', 'retrying'];

@Component({
  imports: [DatePipe, JsonPipe],
  selector: 'app-jobs',
  styleUrl: './jobs.component.scss',
  templateUrl: './jobs.component.html',
})
export class JobsComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly jobService = inject(JobService);
  private readonly loadRequests = new Subject<JobListRequest>();
  private pollingSubscription: Subscription | null = null;

  readonly jobs = signal<BackgroundJob[]>([]);
  readonly stats = signal<JobStats | null>(null);
  readonly jobDetails = signal<BackgroundJob | null>(null);
  readonly loading = signal(true);
  readonly statsLoading = signal(true);
  readonly detailLoading = signal(false);
  readonly currentPage = signal(1);
  readonly totalPages = signal(0);
  readonly totalJobs = signal(0);
  readonly statusFilter = signal<JobStatus | ''>('');
  readonly typeFilter = signal<JobType | ''>('');
  readonly expandedJobId = signal('');
  readonly listError = signal('');
  readonly statsError = signal('');
  readonly detailError = signal('');
  readonly pageSize = 20;
  private detailSubscription: Subscription | null = null;

  constructor() {
    this.loadRequests
      .pipe(
        switchMap(({ page, status, type }) => {
          this.stopPolling();
          this.loading.set(true);
          this.listError.set('');
          return this.jobService
            .list(status || undefined, type || undefined, page, this.pageSize)
            .pipe(
              tap((response) => {
                this.updateJobList(response);
                if (this.hasActiveJobs(response.jobs) || this.hasActiveStats(this.stats())) {
                  this.startPolling();
                }
              }),
              catchError((error: unknown) => {
                this.jobs.set([]);
                this.totalJobs.set(0);
                this.totalPages.set(0);
                this.listError.set(getHttpErrorMessage(error, 'Could not load background jobs.'));
                return EMPTY;
              }),
              finalize(() => this.loading.set(false)),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.loadJobs();
    this.loadStats();
  }

  loadJobs(
    page = this.currentPage(),
    status = this.statusFilter(),
    type = this.typeFilter(),
  ): void {
    this.currentPage.set(page);
    this.statusFilter.set(status);
    this.typeFilter.set(type);
    this.loadRequests.next({ page, status, type });
  }

  refresh(): void {
    this.loadJobs();
    this.loadStats();
  }

  onStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.loadJobs(1, this.isJobStatus(value) ? value : '');
  }

  onTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.loadJobs(1, this.statusFilter(), this.isJobType(value) ? value : '');
  }

  toggleDetails(jobId: string): void {
    if (this.expandedJobId() === jobId) {
      this.expandedJobId.set('');
      this.detailSubscription?.unsubscribe();
      this.jobDetails.set(null);
      this.detailError.set('');
      this.detailLoading.set(false);
      return;
    }

    this.expandedJobId.set(jobId);
    this.detailSubscription?.unsubscribe();
    this.jobDetails.set(null);
    this.detailError.set('');
    this.detailLoading.set(true);
    this.detailSubscription = this.jobService
      .getById(jobId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (this.expandedJobId() === jobId) this.detailLoading.set(false);
        }),
      )
      .subscribe({
        next: (response) => {
          if (this.expandedJobId() === jobId) this.jobDetails.set(response.job);
        },
        error: (error: unknown) => {
          if (this.expandedJobId() === jobId) {
            this.detailError.set(getHttpErrorMessage(error, 'Could not load job details.'));
          }
        },
      });
  }

  statusLabel(status: JobStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  typeLabel(type: JobType): string {
    return {
      notification: 'Notification',
      activityLog: 'Activity log',
      reportGeneration: 'Report generation',
      jsonExport: 'JSON export',
      csvExport: 'CSV export',
    }[type];
  }

  jobIcon(type: JobType): string {
    return {
      notification: 'pi pi-bell',
      activityLog: 'pi pi-history',
      reportGeneration: 'pi pi-chart-bar',
      jsonExport: 'pi pi-code',
      csvExport: 'pi pi-file-excel',
    }[type];
  }

  jobIconClass(type: JobType): string {
    return {
      notification: 'notification-icon',
      activityLog: 'activity-icon',
      reportGeneration: 'report-icon',
      jsonExport: 'export-icon',
      csvExport: 'export-icon',
    }[type];
  }

  attemptLabel(job: BackgroundJob): string {
    return `${job.attempts} of ${job.maxAttempts} ${job.maxAttempts === 1 ? 'attempt' : 'attempts'}`;
  }

  private loadStats(): void {
    this.statsLoading.set(true);
    this.statsError.set('');
    this.jobService
      .stats()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((error: unknown) => {
          this.stats.set(null);
          this.statsError.set(getHttpErrorMessage(error, 'Could not load queue statistics.'));
          return EMPTY;
        }),
        finalize(() => this.statsLoading.set(false)),
      )
      .subscribe((response) => {
        this.stats.set(response.stats);
        if (this.hasActiveStats(response.stats)) this.startPolling();
      });
  }

  private updateJobList(response: JobListResponse): void {
    this.jobs.set(response.jobs);
    this.currentPage.set(response.pagination.page);
    this.totalPages.set(response.pagination.totalPages);
    this.totalJobs.set(response.pagination.total);
  }

  private startPolling(): void {
    if (this.pollingSubscription && !this.pollingSubscription.closed) return;

    this.pollingSubscription = interval(3000)
      .pipe(
        switchMap(() =>
          this.jobService.list(
            this.statusFilter() || undefined,
            this.typeFilter() || undefined,
            this.currentPage(),
            this.pageSize,
          ),
        ),
        tap((response) => {
          this.updateJobList(response);
          this.loadStats();
        }),
        takeWhile(
          (response) => this.hasActiveJobs(response.jobs) || this.hasActiveStats(this.stats()),
          true,
        ),
        catchError((error: unknown) => {
          this.listError.set(
            getHttpErrorMessage(error, 'Could not refresh job status. Use Refresh to try again.'),
          );
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private hasActiveJobs(jobs: BackgroundJob[]): boolean {
    return jobs.some((job) => ACTIVE_JOB_STATUSES.includes(job.status));
  }

  private hasActiveStats(stats: JobStats | null): boolean {
    return Boolean(
      stats && stats.queue.pending + stats.queue.processing + stats.queue.retrying > 0,
    );
  }

  private stopPolling(): void {
    this.pollingSubscription?.unsubscribe();
    this.pollingSubscription = null;
  }

  private isJobStatus(value: string): value is JobStatus {
    return ['pending', 'processing', 'retrying', 'completed', 'failed'].includes(value);
  }

  private isJobType(value: string): value is JobType {
    return ['notification', 'activityLog', 'reportGeneration', 'jsonExport', 'csvExport'].includes(
      value,
    );
  }
}
