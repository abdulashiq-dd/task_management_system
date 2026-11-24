import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

const THEME_STORAGE_KEY = 'taskorbit-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = this.document.defaultView?.localStorage;

  readonly isDark = signal(this.storage?.getItem(THEME_STORAGE_KEY) === 'dark');

  constructor() {
    this.applyTheme();
  }

  toggle(): void {
    this.isDark.update((isDark) => !isDark);
    this.applyTheme();
    this.storage?.setItem(THEME_STORAGE_KEY, this.isDark() ? 'dark' : 'light');
  }

  private applyTheme(): void {
    this.document.documentElement.classList.toggle('app-dark', this.isDark());
  }
}
