import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: { login: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = { login: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows an actionable message when the API cannot be reached', () => {
    authService.login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    component.loginForm.setValue({ email: 'abdul@example.com', password: 'password123' });

    component.submit();

    expect(component.errorMessage()).toContain('Check that the backend is running');
    expect(component.submitting()).toBe(false);
  });

  it('shows the API message for rejected credentials', () => {
    authService.login.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            error: { message: 'Invalid email or password' },
          }),
      ),
    );
    component.loginForm.setValue({ email: 'abdul@example.com', password: 'wrong-password' });

    component.submit();

    expect(component.errorMessage()).toBe('Invalid email or password');
  });
});
