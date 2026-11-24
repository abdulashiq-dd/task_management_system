
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners
} from '@angular/core';

import { provideRouter } from '@angular/router';

import {
  provideHttpClient,
  withInterceptors
} from '@angular/common/http';

import { definePreset } from '@primeuix/themes';
import { providePrimeNG } from 'primeng/config';

import {
  MessageService,
  ConfirmationService
} from 'primeng/api';

import Aura from '@primeuix/themes/aura';

import { routes } from './app.routes';

import {
  authInterceptor
} from './core/interceptors/auth.interceptor';

const TaskOrbitPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#eef2ff',
      100: '#e0e7ff',
      200: '#c7d2fe',
      300: '#a5b4fc',
      400: '#818cf8',
      500: '#6366f1',
      600: '#4f46e5',
      700: '#4338ca',
      800: '#3730a3',
      900: '#312e81',
      950: '#1e1b4b'
    }
  }
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    provideRouter(routes),

    provideHttpClient(
      withInterceptors([authInterceptor])
    ),

    MessageService,
    ConfirmationService,

    providePrimeNG({
      theme: {
        preset: TaskOrbitPreset,
        options: {
          darkModeSelector: '.app-dark'
        }
      },
      ripple: true
    })
  ]
};
