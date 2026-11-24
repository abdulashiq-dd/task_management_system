import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { DashboardService } from '../../../core/services/dashboard.service';
import { DashboardStats } from '../../../core/models/dashboard.model';
import { AdminDashboardComponent } from './admin-dashboard.component';

describe('AdminDashboardComponent', () => {
  let fixture: ComponentFixture<AdminDashboardComponent>;

  beforeEach(async () => {
    const stats: DashboardStats = {
      totalTasks: 8,
      completedTasks: 3,
      pendingTasks: 4,
      overdueTasks: 1,
      tasksByPriority: { low: 2, medium: 4, high: 2 },
      recentActivity: [],
    };

    await TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: () => ({ name: 'Morgan' }) } },
        { provide: DashboardService, useValue: { getDashboard: () => of(stats) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('shows the admin workspace overview', () => {
    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(content).toContain('Welcome back, Morgan');
    expect(content).toContain('Across all users');
    expect(content).toContain('8');
    expect(content).toContain('38%');
  });
});
