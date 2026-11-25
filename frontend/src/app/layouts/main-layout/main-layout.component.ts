import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { PasskeyService } from '../../core/services/passkey.service';
import { ThemeService } from '../../core/services/theme.service';

interface NavigationItem {
  label: string;
  icon: string;
  route: string;
}

interface BreadcrumbItem {
  label: string;
  route: string;
}

const SIDEBAR_STORAGE_KEY = 'taskorbit-sidebar-expanded';

@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly passkeyService = inject(PasskeyService);
  private readonly messageService = inject(MessageService);
  readonly themeService = inject(ThemeService);

  readonly currentUser = this.authService.currentUser;
  readonly passkeyBusy = signal(false);
  readonly sidebarExpanded = signal(this.restoreSidebarPreference());
  readonly mobileDrawerOpen = signal(false);
  readonly profileMenuOpen = signal(false);
  readonly pageTitle = signal('Workspace');
  readonly breadcrumbs = signal<BreadcrumbItem[]>([]);
  readonly userInitials = computed(() => {
    const name = this.currentUser()?.name?.trim();
    return name
      ? name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part.charAt(0))
          .join('')
          .toUpperCase()
      : '?';
  });
  readonly roleLabel = computed(() =>
    this.authService.isAdmin() ? 'Administrator' : 'Team member',
  );
  readonly dashboardRoute = computed(() =>
    this.authService.isAdmin() ? '/admin/dashboard' : '/dashboard',
  );
  readonly menuItems = computed<NavigationItem[]>(() => {
    const items: NavigationItem[] = [
      {
        label: this.authService.isAdmin() ? 'Admin dashboard' : 'Dashboard',
        icon: this.authService.isAdmin() ? 'pi pi-shield' : 'pi pi-home',
        route: this.dashboardRoute(),
      },
      { label: 'Tasks', icon: 'pi pi-check-square', route: '/tasks' },
      { label: 'Notifications', icon: 'pi pi-bell', route: '/notifications' },
      { label: 'Activity', icon: 'pi pi-history', route: '/activity' },
      { label: 'Reports & Exports', icon: 'pi pi-chart-bar', route: '/reports' },
      { label: 'Background Jobs', icon: 'pi pi-sync', route: '/jobs' },
    ];

    return items;
  });

  constructor() {
    this.updateRouteContext();
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.updateRouteContext();
        this.profileMenuOpen.set(false);
        this.mobileDrawerOpen.set(false);
      });
  }

  toggleSidebar(): void {
    if (this.isMobile()) {
      this.mobileDrawerOpen.update((open) => !open);
      return;
    }

    this.sidebarExpanded.update((expanded) => !expanded);
    this.document.defaultView?.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      String(this.sidebarExpanded()),
    );
  }

  closeMobileDrawer(): void {
    this.mobileDrawerOpen.set(false);
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen.update((open) => !open);
  }

  closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }

  logout(): void {
    this.authService.logout();
  }

  async addPasskey(): Promise<void> {
    if (this.passkeyBusy()) {
      return;
    }

    this.passkeyBusy.set(true);
    try {
      await this.passkeyService.register();
      this.messageService.add({
        severity: 'success',
        summary: 'Passkey added',
        detail: 'You can now sign in with this passkey.',
      });
    } catch (error) {
      const detail = error instanceof HttpErrorResponse
        ? error.error?.message || 'Unable to add a passkey. Please try again.'
        : error instanceof Error && error.name === 'NotAllowedError'
          ? 'Passkey setup was cancelled.'
          : error instanceof Error
            ? error.message
            : 'Unable to add a passkey. Please try again.';
      this.messageService.add({
        severity: 'error',
        summary: 'Passkey not added',
        detail,
      });
    } finally {
      this.passkeyBusy.set(false);
    }
  }

  private isMobile(): boolean {
    return (this.document.defaultView?.innerWidth ?? 0) <= 900;
  }

  private restoreSidebarPreference(): boolean {
    const saved = this.document.defaultView?.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return saved === null || saved === undefined ? true : saved === 'true';
  }

  private updateRouteContext(): void {
    let route = this.router.routerState.snapshot.root;
    const breadcrumbItems: BreadcrumbItem[] = [];
    let title = 'Workspace';

    while (route.firstChild) {
      route = route.firstChild;
      const routeTitle = route.title;
      if (typeof routeTitle === 'string') {
        title = routeTitle.replace(/\s*\|\s*TaskOrbit$/, '');
      }

      const breadcrumb = route.data['breadcrumb'];
      if (typeof breadcrumb === 'string') {
        breadcrumbItems.push({
          label: breadcrumb,
          route: `/${route.pathFromRoot
            .flatMap((snapshot) => snapshot.url.map((segment) => segment.path))
            .join('/')}`,
        });
      }
    }

    this.pageTitle.set(title);
    this.breadcrumbs.set(breadcrumbItems);
  }
}
