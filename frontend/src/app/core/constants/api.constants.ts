export const API_BASE_URL = '/api';

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: `${API_BASE_URL}/auth/login`,
    REGISTER: `${API_BASE_URL}/auth/register`,
  },
  TASKS: `${API_BASE_URL}/tasks`,
  DASHBOARD: `${API_BASE_URL}/dashboard`,
  ACTIVITY: `${API_BASE_URL}/activity`,
  NOTIFICATIONS: `${API_BASE_URL}/notifications`,
  REPORTS: `${API_BASE_URL}/reports`,
  EXPORTS: `${API_BASE_URL}/exports`,
  JOBS: `${API_BASE_URL}/jobs`,
} as const;
