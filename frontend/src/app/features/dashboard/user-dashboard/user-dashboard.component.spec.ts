import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { DashboardService } from '../../../core/services/dashboard.service';
import { DashboardStats } from '../../../core/models/dashboard.model';
import { UserDashboardComponent } from './user-dashboard.component';

describe('UserDashboardComponent', () => {
  let fixture: ComponentFixture<UserDashboardComponent>;

  beforeEach(async () => {
    const stats: DashboardStats = {
      totalTasks: 5,
      completedTasks: 2,
      pendingTasks: 2,
      overdueTasks: 1,
      tasksByPriority: { low: 1, medium: 2, high: 2 },
      recentActivity: [],
    };

    await TestBed.configureTestingModule({
      imports: [UserDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: () => ({ name: 'Taylor' }) } },
        { provide: DashboardService, useValue: { getDashboard: () => of(stats) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserDashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('shows the signed-in user and their task summary', () => {
    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(content).toContain('Good to see you, Taylor');
    expect(content).toContain('Total tasks');
    expect(content).toContain('5');
    expect(content).toContain('40% completion rate');
  });
});
