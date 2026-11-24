import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.removeItem('taskorbit-theme');
    document.documentElement.classList.remove('app-dark');
    TestBed.configureTestingModule({
      providers: [ThemeService],
    });
  });

  afterEach(() => {
    localStorage.removeItem('taskorbit-theme');
    document.documentElement.classList.remove('app-dark');
  });

  it('restores the saved dark theme', () => {
    localStorage.setItem('taskorbit-theme', 'dark');

    const themeService = TestBed.inject(ThemeService);

    expect(themeService.isDark()).toBe(true);
    expect(document.documentElement.classList.contains('app-dark')).toBe(true);
  });

  it('toggles and persists the theme preference', () => {
    const themeService = TestBed.inject(ThemeService);

    themeService.toggle();

    expect(themeService.isDark()).toBe(true);
    expect(localStorage.getItem('taskorbit-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('app-dark')).toBe(true);
  });
});
