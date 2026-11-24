import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

import { API_ENDPOINTS } from '../constants/api.constants';
import { DashboardResponse, DashboardStats } from '../models/dashboard.model';

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly http = inject(HttpClient);

  getDashboard(): Observable<DashboardStats> {
    return this.http
      .get<DashboardResponse>(API_ENDPOINTS.DASHBOARD)
      .pipe(map((response) => response.dashboard));
  }
}
