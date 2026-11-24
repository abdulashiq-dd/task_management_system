import { Injectable, inject, signal, computed } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { API_ENDPOINTS } from '../constants/api.constants';

import {
  AuthSession,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from '../models/auth.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly storageKey = 'taskorbit_session';

  private readonly session = signal<AuthSession | null>(this.restoreSession());

  readonly currentUser = computed(() => this.session()?.user ?? null);

  readonly isAuthenticated = computed(() => this.session() !== null);

  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');

  login(data: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(API_ENDPOINTS.AUTH.LOGIN, data).pipe(
      tap((response) => {
        const session: AuthSession = {
          token: response.token,
          user: response.user,
        };

        sessionStorage.setItem(this.storageKey, JSON.stringify(session));

        this.session.set(session);
      }),
    );
  }

  register(data: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(API_ENDPOINTS.AUTH.REGISTER, data);
  }

  getToken(): string | null {
    const token = this.session()?.token;

    if (!token || !this.isTokenValid(token)) {
      this.clearSession();
      return null;
    }

    return token;
  }

  logout(): void {
    this.clearSession();
    void this.router.navigate(['/logout']);
  }

  completeLogout(): void {
    this.clearSession();
  }

  private clearSession(): void {
    sessionStorage.removeItem(this.storageKey);
    this.session.set(null);
  }

  private restoreSession(): AuthSession | null {
    try {
      const stored = sessionStorage.getItem(this.storageKey);

      if (!stored) {
        return null;
      }

      const session = JSON.parse(stored) as AuthSession;

      if (
        !session.user?.id ||
        !['user', 'admin'].includes(session.user.role) ||
        !this.isTokenValid(session.token)
      ) {
        sessionStorage.removeItem(this.storageKey);
        return null;
      }

      return session;
    } catch {
      sessionStorage.removeItem(this.storageKey);
      return null;
    }
  }

  private isTokenValid(token: string): boolean {
    try {
      const payload = token.split('.')[1];

      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));

      return typeof decoded.exp === 'number' && decoded.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }
}
