import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { guestGuard } from './guest.guard';

describe('guestGuard', () => {
  let authService: { getToken: ReturnType<typeof vi.fn>; isAdmin: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(() => {
    authService = { getToken: vi.fn(), isAdmin: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
      ],
    });
    router = TestBed.inject(Router);
  });

  function runGuard() {
    return TestBed.runInInjectionContext(() =>
      guestGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
  }

  it('allows unauthenticated users to open the login page', () => {
    authService.getToken.mockReturnValue(null);

    expect(runGuard()).toBe(true);
  });

  it('redirects an authenticated user to the dashboard instead of showing login again', () => {
    authService.getToken.mockReturnValue('valid-token');
    authService.isAdmin.mockReturnValue(false);

    const result = runGuard();

    if (!(result instanceof UrlTree)) {
      throw new Error('Expected authenticated users to be redirected');
    }
    expect(router.serializeUrl(result)).toBe('/dashboard');
  });

  it('redirects an authenticated administrator to the admin dashboard', () => {
    authService.getToken.mockReturnValue('valid-token');
    authService.isAdmin.mockReturnValue(true);

    const result = runGuard();

    if (!(result instanceof UrlTree)) {
      throw new Error('Expected administrators to be redirected');
    }
    expect(router.serializeUrl(result)).toBe('/admin/dashboard');
  });
});
