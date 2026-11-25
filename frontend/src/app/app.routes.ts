import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { dashboardRedirectGuard } from './core/guards/dashboard-redirect.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  // Default route
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },

  // Public routes
  {
    path: 'login',
    title: 'Login | TaskOrbit',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'logout',
    title: 'Signed Out | TaskOrbit',
    loadComponent: () =>
      import('./features/auth/logout/logout.component').then((m) => m.LogoutComponent),
  },
  {
    path: 'register',
    redirectTo: 'signup',
    pathMatch: 'full',
  },
  {
    path: 'signup',
    title: 'Sign Up | TaskOrbit',
    loadComponent: () =>
      import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
  },

  // Protected routes
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [authGuard],

    loadComponent: () =>
      import('./layouts/main-layout/main-layout.component').then((m) => m.MainLayoutComponent),

    children: [
      // User dashboard
      {
        path: 'dashboard',
        title: 'Dashboard | TaskOrbit',
        canActivate: [dashboardRedirectGuard],
        loadComponent: () =>
          import('./features/dashboard/user-dashboard/user-dashboard.component').then(
            (m) => m.UserDashboardComponent,
          ),
      },

      // Admin dashboard
      {
        path: 'admin/dashboard',
        title: 'Admin Dashboard | TaskOrbit',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/dashboard/admin-dashboard/admin-dashboard.component').then(
            (m) => m.AdminDashboardComponent,
          ),
      },

      // Task listing
      {
        path: 'tasks',
        title: 'Tasks | TaskOrbit',
        loadComponent: () =>
          import('./features/tasks/task-list/task-list.component').then((m) => m.TaskListComponent),
      },

      // Create task
      {
        path: 'tasks/create',
        title: 'Create Task | TaskOrbit',
        loadComponent: () =>
          import('./features/tasks/task-form/task-form.component').then((m) => m.TaskFormComponent),
      },

      // Edit task
      {
        path: 'tasks/:id/edit',
        title: 'Edit Task | TaskOrbit',
        loadComponent: () =>
          import('./features/tasks/task-form/task-form.component').then((m) => m.TaskFormComponent),
      },

      // Task details
      {
        path: 'tasks/:id',
        title: 'Task Details | TaskOrbit',
        loadComponent: () =>
          import('./features/tasks/task-details/task-details.component').then(
            (m) => m.TaskDetailsComponent,
          ),
      },

      // Notifications
      {
        path: 'notifications',
        title: 'Notifications | TaskOrbit',
        loadComponent: () =>
          import('./features/notifications/notifications/notifications.component').then(
            (m) => m.NotificationsComponent,
          ),
      },

      // Activity
      {
        path: 'activity',
        title: 'Activity | TaskOrbit',
        loadComponent: () =>
          import('./features/activity/activity/activity.component').then(
            (m) => m.ActivityComponent,
          ),
      },

      // Reports
      {
        path: 'reports',
        title: 'Reports | TaskOrbit',
        loadComponent: () =>
          import('./features/reports/reports/reports.component').then((m) => m.ReportsComponent),
      },

      // Background jobs
      {
        path: 'jobs',
        title: 'Background Jobs | TaskOrbit',
        loadComponent: () =>
          import('./features/jobs/jobs/jobs.component').then((m) => m.JobsComponent),
      },
    ],
  },

  // Access denied
  {
    path: 'forbidden',
    title: 'Access Denied | TaskOrbit',
    loadComponent: () =>
      import('./features/errors/forbidden/forbidden.component').then((m) => m.ForbiddenComponent),
  },

  // Page not found
  {
    path: '**',
    title: 'Page Not Found | TaskOrbit',
    loadComponent: () =>
      import('./features/errors/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
