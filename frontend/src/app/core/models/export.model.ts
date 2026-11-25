import { Pagination } from './pagination.model';
import { BackgroundJob } from './job.model';

export type ExportType = 'json' | 'csv' | 'reports';
export type ExportStatus = 'pending' | 'processing' | 'retrying' | 'completed' | 'failed';

export interface TaskExport {
  id: string;
  userId: string;
  backgroundJobId: string;
  type: ExportType;
  fileName: string;
  mimeType: string;
  size: number;
  totalRecords: number;
  status: ExportStatus;
  filters: Record<string, unknown>;
  error: string | null;
  isDownloadable: boolean;
  downloadUrl: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  failedAt: string | null;
}

export interface ExportListResponse {
  success: boolean;
  message: string;
  count: number;
  exports: TaskExport[];
  pagination: Pagination;
}

export interface QueuedJobResponse {
  success: boolean;
  message: string;
  job: BackgroundJob;
  exportId: string;
  statusUrl: string;
  exportUrl: string;
}
