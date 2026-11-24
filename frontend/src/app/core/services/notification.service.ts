import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../constants/api.constants';
import { NotificationListResponse } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 20): Observable<NotificationListResponse> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http.get<NotificationListResponse>(API_ENDPOINTS.NOTIFICATIONS, { params });
  }

  markAsRead(id: string): Observable<unknown> {
    return this.http.patch(`${API_ENDPOINTS.NOTIFICATIONS}/${id}/read`, {});
  }

  markAllAsRead(): Observable<{ message: string; modifiedCount: number }> {
    return this.http.patch<{ message: string; modifiedCount: number }>(
      `${API_ENDPOINTS.NOTIFICATIONS}/read-all`,
      {},
    );
  }
}
