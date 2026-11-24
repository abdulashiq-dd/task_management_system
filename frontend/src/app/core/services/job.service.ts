import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../constants/api.constants';
import { BackgroundJob, JobListResponse, JobStats, JobStatus, JobType } from '../models/job.model';

@Injectable({ providedIn: 'root' })
export class JobService {
  private readonly http = inject(HttpClient);

  list(status?: JobStatus, type?: JobType, page = 1, limit = 20): Observable<JobListResponse> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (status) params = params.set('status', status);
    if (type) params = params.set('type', type);
    return this.http.get<JobListResponse>(API_ENDPOINTS.JOBS, { params });
  }

  getById(id: string): Observable<{ success: boolean; message: string; job: BackgroundJob }> {
    return this.http.get<{ success: boolean; message: string; job: BackgroundJob }>(
      `${API_ENDPOINTS.JOBS}/${id}`,
    );
  }

  stats(): Observable<{ success: boolean; message: string; stats: JobStats }> {
    return this.http.get<{ success: boolean; message: string; stats: JobStats }>(
      `${API_ENDPOINTS.JOBS}/stats`,
    );
  }
}
