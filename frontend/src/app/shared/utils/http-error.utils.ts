import { HttpErrorResponse } from '@angular/common/http';

export interface HttpErrorPayload {
  message?: string;
}

export function getHttpErrorMessage(
  error: unknown,
  fallback = 'An unexpected error occurred. Please try again.',
): string {
  if (error instanceof HttpErrorResponse) {
    const payload = error.error as HttpErrorPayload | null;
    if (typeof payload?.message === 'string' && payload.message.trim()) {
      return payload.message;
    }
  }

  return fallback;
}
