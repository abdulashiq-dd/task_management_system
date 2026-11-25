import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_ENDPOINTS } from '../constants/api.constants';
import { ActivityEventType, ActivityListResponse } from '../models/activity.model';

@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 20, eventType?: ActivityEventType): Observable<ActivityListResponse> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (eventType) params = params.set('eventType', eventType);
    return this.http.get<ActivityListResponse>(API_ENDPOINTS.ACTIVITY, { params });
  }
}
