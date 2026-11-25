import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { PasskeyService } from '../../../core/services/passkey.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-login',
  styleUrl: './login.component.scss',
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly passkeyService = inject(PasskeyService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly passkeySubmitting = signal(false);
  readonly errorMessage = signal('');

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set('');

    this.authService.login(this.loginForm.getRawValue()).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigate([this.authService.isAdmin() ? '/admin/dashboard' : '/dashboard']);
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(
          error.status === 0
            ? 'Cannot connect to the server. Check that the backend is running, then try again.'
            : error.error?.message || 'Unable to sign in. Please try again.',
        );
      },
    });
  }

  async submitPasskey(): Promise<void> {
    if (this.submitting() || this.passkeySubmitting()) {
      return;
    }

    this.passkeySubmitting.set(true);
    this.errorMessage.set('');

    try {
      await this.passkeyService.login();
      void this.router.navigate([
        this.authService.isAdmin() ? '/admin/dashboard' : '/dashboard',
      ]);
    } catch (error) {
      this.errorMessage.set(this.passkeyErrorMessage(error));
    } finally {
      this.passkeySubmitting.set(false);
    }
  }

  private passkeyErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.message || 'Unable to sign in with a passkey. Please try again.';
    }

    if (error instanceof Error && error.name === 'NotAllowedError') {
      return 'Passkey sign-in was cancelled or no matching passkey is available.';
    }

    return error instanceof Error
      ? error.message
      : 'Unable to sign in with a passkey. Please try again.';
  }
}
