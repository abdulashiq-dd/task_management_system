# TaskOrbit API Integration Reference

The backend is the source of truth. Paths are relative to the Express application mounted at `/api`. `/api/auth/*` is public; every other route requires `Authorization: Bearer <JWT>`.

Handled backend errors use `{ "message": "..." }`. Dashboard, jobs, exports, and reports also opt into `success: false` on handled errors.

## Authentication

| Method | Path | Auth | Request | Success |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public; 10 requests/IP/15 min | `{ name, email, password }` | `201`: `{ message, user }` |
| `POST` | `/api/auth/login` | Public; 30 requests/IP/15 min | `{ email, password }` | `200`: `{ message, token, user }` |

Registration requires name, valid email, and password with 8–72 UTF-8 bytes. Registration always creates a `user`; email uniqueness is enforced. JWTs use HS256 and expire after one hour.

## Tasks

| Method | Path | Auth / permission | Request |
|---|---|---|---|
| `POST` | `/api/tasks` | Authenticated; creator becomes `createdBy` | Task fields |
| `GET` | `/api/tasks` | Authenticated; users see created or assigned tasks, admins see all | Query filters |
| `GET` | `/api/tasks/:id` | Creator, assignee, or admin | None |
| `PATCH` | `/api/tasks/:id` | Creator or admin | Task fields |
| `DELETE` | `/api/tasks/:id` | Creator or admin | None |
| `PATCH` | `/api/tasks/:id/assign` | Creator or admin | `{ assignedTo: "<user id>" }` |

Create/update fields are `title`, `description`, `status`, `priority`, `dueDate`, and `tags`. Status values are `pending`, `in_progress`, `completed`; priorities are `low`, `medium`, `high`. Unknown fields are rejected.

List parameters: `status`, `priority`, `search`, `tag`, `fromDate`, `toDate`, `sortBy` (`dueDate`, `priority`, `createdAt`), `order` (`asc`, `desc`), `page`, and `limit`. Dates use `YYYY-MM-DD`; page must be positive and limit cannot exceed 100.

List success:

```json
{
  "message": "Tasks fetched successfully",
  "count": 10,
  "totalTasks": 42,
  "totalPages": 5,
  "currentPage": 1,
  "tasks": []
}
```

## Dashboard

| Method | Path | Auth | Response |
|---|---|---|---|
| `GET` | `/api/dashboard` | Authenticated | Scoped statistics and recent activity |

Users see created or assigned task statistics and activity. Admins see the complete task scope.

## Notifications

| Method | Path | Auth | Request / response |
|---|---|---|---|
| `GET` | `/api/notifications?page=1&limit=20` | Authenticated, own notifications | Paginated notifications |
| `PATCH` | `/api/notifications/:id/read` | Authenticated, own notification | Updated notification |
| `PATCH` | `/api/notifications/read-all` | Authenticated | `{ modifiedCount }` |

Types: `taskAssigned`, `taskCompleted`, `priorityChanged`, `taskReminder`, `taskOverdue`. Pagination defaults to 20 and allows a maximum of 100.

## Background jobs

| Method | Path | Auth | Request |
|---|---|---|---|
| `GET` | `/api/jobs` | Authenticated | `status`, `type`, `page`, `limit` |
| `GET` | `/api/jobs/stats` | Authenticated; worker stats are admin-only | None |
| `GET` | `/api/jobs/:id` | Owner or admin | None |

Statuses: `pending`, `processing`, `retrying`, `completed`, `failed`. Types: `notification`, `activityLog`, `reportGeneration`, `jsonExport`, `csvExport`.

## Exports

| Method | Path | Auth | Request |
|---|---|---|---|
| `POST` | `/api/exports/json` | Authenticated | `{ "filters": {} }` |
| `POST` | `/api/exports/csv` | Authenticated | `{ "filters": {} }` |
| `GET` | `/api/exports` | Owner or admin | `type`, `status`, `page`, `limit` |
| `GET` | `/api/exports/:id` | Owner or admin | None |
| `GET` | `/api/exports/:id/download` | Owner or admin; completed only | None |

POST endpoints return `202` with `job`, `exportId`, `statusUrl`, and `exportUrl`. Export types are `json`, `csv`, and `report`; statuses are `pending`, `processing`, `retrying`, `completed`, `failed`.

Only `filters` is accepted. Filters mirror task filters: `status`, `priority`, `search`, `tag`, `fromDate`, `toDate`. Regular users cannot access admin-generated completed exports.

## Reports

| Method | Path | Auth | Request | Success |
|---|---|---|---|---|
| `POST` | `/api/reports/generate` | Authenticated | `{ "reportType": "taskSummary" }` | `202` |

Only `taskSummary` is supported and no additional fields are accepted.

## Polling workflow

1. POST an export or report endpoint.
2. Read `statusUrl` and `exportUrl` from the `202` response.
3. Poll `GET /api/jobs/:id`.
4. When completed, retrieve metadata or call `GET /api/exports/:id/download`.
5. Surface the sanitized error for a failed job.
