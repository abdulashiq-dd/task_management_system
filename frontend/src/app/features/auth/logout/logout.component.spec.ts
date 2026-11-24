import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { LogoutComponent } from './logout.component';

describe('LogoutComponent', () => {
  let fixture: ComponentFixture<LogoutComponent>;
  const completeLogout = vi.fn();

  beforeEach(async () => {
    completeLogout.mockClear();

    await TestBed.configureTestingModule({
      imports: [LogoutComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: { completeLogout } }],
    }).compileComponents();

    fixture = TestBed.createComponent(LogoutComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('clears the session and offers a route back to sign in', () => {
    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(completeLogout).toHaveBeenCalledOnce();
    expect(content).toContain('You’re signed out');
    expect(content).toContain('Sign in again');
  });
});
