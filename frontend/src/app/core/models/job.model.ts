import { Pagination } from './pagination.model';

export type JobStatus = 'pending' | 'processing' | 'retrying' | 'completed' | 'failed';
export type JobType =
  | 'notification'
  | 'activityLog'
  | 'reportGeneration'
  | 'jsonExport'
  | 'csvExport';

export interface BackgroundJob {
  id: string;
  type: JobType;
  userId: string | null;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  retryCount: number;
  maxRetries: number;
  retryDelay: number;
  nextRetryAt: string | null;
  isPermanentlyFailed: boolean;
  createdAt: string;
  startedAt: string | null;
  lastAttemptAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  result?: unknown;
  error?: string | null;
  lastError?: string | null;
  errorHistory?: Array<{
    attempt: number;
    message: string;
    timestamp: string;
    retryable: boolean;
  }>;
}

export interface JobListResponse {
  success: boolean;
  message: string;
  pagination: Pagination;
  count: number;
  jobs: BackgroundJob[];
}

export interface JobStats {
  queue: {
    pending: number;
    processing: number;
    retrying: number;
    completed: number;
    failed: number;
  };
  retries: {
    totalAttempts: number;
    totalRetriesScheduled: number;
    totalRetryAttempts: number;
    failedAttempts: number;
    retriedJobs: number;
    recoveredJobs: number;
    permanentlyFailedJobs: number;
    awaitingRetry: number;
  };
  worker?: unknown;
}
