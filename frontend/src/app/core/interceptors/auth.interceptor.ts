
import {
  HttpInterceptorFn,
  HttpErrorResponse
} from '@angular/common/http';

import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (
  request,
  next
) => {
  const publicAuthEndpoints = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/password-encryption/public-key',
    '/api/auth/password-encryption/challenges',
    '/api/auth/passkeys/authentication/options',
    '/api/auth/passkeys/authentication/verify',
  ];

  if (
    !request.url.startsWith('/api/') ||
    publicAuthEndpoints.includes(request.url)
  ) {
    return next(request);
  }

  const authService = inject(AuthService);
  const token = authService.getToken();

  const authenticatedRequest = token
    ? request.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      })
    : request;

  return next(authenticatedRequest).pipe(
    catchError((error: HttpErrorResponse) => {

      if (error.status === 401) {
        authService.logout();
      }

      return throwError(() => error);

    })
  );
};
