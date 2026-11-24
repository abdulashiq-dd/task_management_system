import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../constants/api.constants';
import { ExportListResponse, ExportStatus, ExportType, QueuedJobResponse, TaskExport } from '../models/export.model';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly http = inject(HttpClient);

  queue(type: 'json' | 'csv', filters: Record<string, unknown> = {}): Observable<QueuedJobResponse> {
    return this.http.post<QueuedJobResponse>(`${API_ENDPOINTS.EXPORTS}/${type}`, { filters });
  }

  generateReport(reportType: 'taskSummary'): Observable<QueuedJobResponse> {
    return this.http.post<QueuedJobResponse>(`${API_ENDPOINTS.REPORTS}/generate`, { reportType });
  }

  list(type?: ExportType, status?: ExportStatus, page = 1, limit = 20): Observable<ExportListResponse> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (type) params = params.set('type', type);
    if (status) params = params.set('status', status);
    return this.http.get<ExportListResponse>(API_ENDPOINTS.EXPORTS, { params });
  }

  getById(id: string): Observable<{ success: boolean; message: string; export: TaskExport }> {
    return this.http.get<{ success: boolean; message: string; export: TaskExport }>(
      `${API_ENDPOINTS.EXPORTS}/${id}`,
    );
  }

  download(id: string): Observable<Blob> {
    return this.http.get(`${API_ENDPOINTS.EXPORTS}/${id}/download`, {
      responseType: 'blob',
    });
  }
}
