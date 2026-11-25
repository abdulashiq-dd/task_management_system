import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  startAuthentication,
  startRegistration,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { firstValueFrom } from 'rxjs';

import { API_ENDPOINTS } from '../constants/api.constants';
import { LoginResponse } from '../models/auth.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class PasskeyService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  async register(): Promise<void> {
    this.ensureSupported();

    const options = await firstValueFrom(
      this.http.post<PublicKeyCredentialCreationOptionsJSON>(
        API_ENDPOINTS.AUTH.PASSKEY_REGISTRATION_OPTIONS,
        {},
      ),
    );
    const response: RegistrationResponseJSON = await startRegistration({ optionsJSON: options });

    await firstValueFrom(
      this.http.post<{ message: string }>(
        API_ENDPOINTS.AUTH.PASSKEY_REGISTRATION_VERIFY,
        response,
      ),
    );
  }

  async login(): Promise<void> {
    this.ensureSupported();

    const options = await firstValueFrom(
      this.http.post<PublicKeyCredentialRequestOptionsJSON>(
        API_ENDPOINTS.AUTH.PASSKEY_AUTHENTICATION_OPTIONS,
        {},
      ),
    );
    const response: AuthenticationResponseJSON = await startAuthentication({
      optionsJSON: options,
    });
    const session = await firstValueFrom(
      this.http.post<LoginResponse>(
        API_ENDPOINTS.AUTH.PASSKEY_AUTHENTICATION_VERIFY,
        response,
      ),
    );

    this.authService.completeLogin(session);
  }

  private ensureSupported(): void {
    if (
      typeof window === 'undefined' ||
      !window.isSecureContext ||
      !('PublicKeyCredential' in window)
    ) {
      throw new Error('Passkeys require a supported browser on HTTPS or localhost.');
    }
  }
}
