
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

  if (
    !request.url.startsWith('/api/') ||
    request.url.startsWith('/api/auth/')
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
