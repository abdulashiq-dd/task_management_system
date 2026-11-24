import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_ENDPOINTS } from '../constants/api.constants';
import { Task, TaskCreateRequest, TaskListQuery, TaskListResponse, TaskUpdateRequest } from '../models/task.model';

interface TaskMutationResponse {
  message: string;
  task: Task;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);

  list(query: TaskListQuery = {}): Observable<TaskListResponse> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });
    return this.http.get<TaskListResponse>(API_ENDPOINTS.TASKS, { params });
  }

  getById(id: string): Observable<Task> {
    return this.http
      .get<{ message: string; task: Task }>(`${API_ENDPOINTS.TASKS}/${id}`)
      .pipe(map((response) => response.task));
  }

  create(request: TaskCreateRequest): Observable<Task> {
    return this.http
      .post<TaskMutationResponse>(API_ENDPOINTS.TASKS, request)
      .pipe(map((response) => response.task));
  }

  update(id: string, request: TaskUpdateRequest): Observable<Task> {
    return this.http
      .patch<TaskMutationResponse>(`${API_ENDPOINTS.TASKS}/${id}`, request)
      .pipe(map((response) => response.task));
  }

  assign(id: string, assignedTo: string): Observable<Task> {
    return this.http
      .patch<TaskMutationResponse>(`${API_ENDPOINTS.TASKS}/${id}/assign`, { assignedTo })
      .pipe(map((response) => response.task));
  }

  delete(id: string): Observable<Task> {
    return this.http
      .delete<TaskMutationResponse>(`${API_ENDPOINTS.TASKS}/${id}`)
      .pipe(map((response) => response.task));
  }
}
