import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { LoginResponse } from '../models/auth.model';
import { PasswordEncryptionService } from './password-encryption.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  let httpTesting: HttpTestingController;
  let passwordEncryption: { encryptPassword: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    sessionStorage.removeItem('taskorbit_session');
    passwordEncryption = { encryptPassword: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PasswordEncryptionService, useValue: passwordEncryption },
      ],
    });
    authService = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    authService.completeLogout();
  });

  it('encrypts login passwords before sending the request', async () => {
    const encrypted = {
      challengeId: 'challenge-id',
      keyId: 'key-id',
      encryptedPassword: 'encrypted-value',
    };
    passwordEncryption.encryptPassword.mockResolvedValue(encrypted);
    const loginResponse: LoginResponse = {
      message: 'Login successful',
      token: 'test-token',
      user: {
        id: 'user-id',
        name: 'Taylor',
        email: 'taylor@example.com',
        role: 'user',
      },
    };

    const responsePromise = firstValueFrom(
      authService.login({ email: ' Taylor@Example.com ', password: 'Password123' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const request = httpTesting.expectOne('/api/auth/login');
    expect(passwordEncryption.encryptPassword).toHaveBeenCalledWith(
      'login',
      ' Taylor@Example.com ',
      'Password123',
    );
    expect(request.request.body).toEqual({
      email: 'taylor@example.com',
      ...encrypted,
    });
    expect(request.request.body.password).toBeUndefined();
    request.flush(loginResponse);
    await responsePromise;
    expect(authService.currentUser()?.id).toBe('user-id');
  });

  it('encrypts registration passwords before sending the request', async () => {
    const encrypted = {
      challengeId: 'challenge-id',
      keyId: 'key-id',
      encryptedPassword: 'encrypted-value',
    };
    passwordEncryption.encryptPassword.mockResolvedValue(encrypted);

    const responsePromise = firstValueFrom(
      authService.register({
        name: 'Taylor',
        email: ' Taylor@Example.com ',
        password: 'Password123',
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const request = httpTesting.expectOne('/api/auth/register');
    expect(passwordEncryption.encryptPassword).toHaveBeenCalledWith(
      'register',
      ' Taylor@Example.com ',
      'Password123',
    );
    expect(request.request.body).toEqual({
      name: 'Taylor',
      email: 'taylor@example.com',
      ...encrypted,
    });
    expect(request.request.body.password).toBeUndefined();
    request.flush({ message: 'User registered successfully', user: {} });
    await responsePromise;
  });
});
