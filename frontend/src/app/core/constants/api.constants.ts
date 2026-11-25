export const API_BASE_URL = '/api';

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: `${API_BASE_URL}/auth/login`,
    REGISTER: `${API_BASE_URL}/auth/register`,
    PASSWORD_ENCRYPTION_KEY: `${API_BASE_URL}/auth/password-encryption/public-key`,
    PASSWORD_ENCRYPTION_CHALLENGES: `${API_BASE_URL}/auth/password-encryption/challenges`,
    USERS: `${API_BASE_URL}/auth/users`,
    PASSKEY_REGISTRATION_OPTIONS: `${API_BASE_URL}/auth/passkeys/registration/options`,
    PASSKEY_REGISTRATION_VERIFY: `${API_BASE_URL}/auth/passkeys/registration/verify`,
    PASSKEY_AUTHENTICATION_OPTIONS: `${API_BASE_URL}/auth/passkeys/authentication/options`,
    PASSKEY_AUTHENTICATION_VERIFY: `${API_BASE_URL}/auth/passkeys/authentication/verify`,
  },
  TASKS: `${API_BASE_URL}/tasks`,
  DASHBOARD: `${API_BASE_URL}/dashboard`,
  ACTIVITY: `${API_BASE_URL}/activity`,
  NOTIFICATIONS: `${API_BASE_URL}/notifications`,
  REPORTS: `${API_BASE_URL}/reports`,
  EXPORTS: `${API_BASE_URL}/exports`,
  JOBS: `${API_BASE_URL}/jobs`,
} as const;
