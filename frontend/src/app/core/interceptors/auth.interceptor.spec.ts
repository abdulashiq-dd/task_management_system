import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getToken: () => 'test-token', logout: vi.fn() } },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('attaches the session token to authenticated auth endpoints', () => {
    TestBed.inject(HttpClient).get('/api/auth/users').subscribe();

    const request = httpTesting.expectOne('/api/auth/users');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush({ users: [] });
  });

  it('does not attach a session token to public authentication requests', () => {
    const http = TestBed.inject(HttpClient);
    http.post('/api/auth/login', {}).subscribe();
    http.post('/api/auth/register', {}).subscribe();
    http.get('/api/auth/password-encryption/public-key').subscribe();
    http.post('/api/auth/password-encryption/challenges', {}).subscribe();
    http.post('/api/auth/passkeys/authentication/options', {}).subscribe();
    http.post('/api/auth/passkeys/authentication/verify', {}).subscribe();

    const login = httpTesting.expectOne('/api/auth/login');
    const registration = httpTesting.expectOne('/api/auth/register');
    const publicKey = httpTesting.expectOne('/api/auth/password-encryption/public-key');
    const challenge = httpTesting.expectOne('/api/auth/password-encryption/challenges');
    const options = httpTesting.expectOne('/api/auth/passkeys/authentication/options');
    const verification = httpTesting.expectOne('/api/auth/passkeys/authentication/verify');
    for (const request of [login, registration, publicKey, challenge, options, verification]) {
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
    }
  });
});
