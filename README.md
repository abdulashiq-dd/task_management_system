# Task Management System

A full-stack task management application named **TaskOrbit**. It includes user authentication, role-based dashboards, task assignment, notifications, activity tracking, reports, JSON/CSV exports, and persistent background jobs.

## Project at a Glance

| Area | Technology |
|---|---|
| Frontend | Angular 22, PrimeNG 22, PrimeFlex, TypeScript |
| Backend | Node.js, Express 5 |
| Database | MongoDB and Mongoose |
| Authentication | JSON Web Tokens (JWT), bcrypt |
| Testing | Node assertion tests, Vitest |
| API URL | `http://localhost:5000/api` |
| Web URL | `http://localhost:4200` |

## Features

- Register and sign in with secure password hashing.
- Use separate user and administrator areas.
- Create, view, update, assign, and delete tasks.
- Filter tasks and monitor task status.
- Receive notifications and view task activity.
- Generate task reports.
- Export tasks as JSON or CSV.
- Track durable background jobs.
- Access protected API routes with JWT authentication.

## Folder Structure

```text
task_management_system/
├── backend/
│   ├── src/
│   │   ├── config/          # Environment, database, exports, runtime lease
│   │   ├── controllers/     # HTTP request handlers
│   │   ├── events/          # Task event and outbox handling
│   │   ├── jobs/            # Scheduled reminder jobs
│   │   ├── middleware/      # Authentication and error middleware
│   │   ├── models/          # Mongoose models
│   │   ├── routes/          # Express API routes
│   │   ├── services/        # Application business logic
│   │   ├── utils/           # Shared backend helpers
│   │   └── workers/         # Background job worker
│   ├── test/                # Unit and integration tests
│   ├── exports/             # Generated export and report files
│   ├── .env.example         # Backend environment template
│   ├── package.json
│   └── server.js
│
└── frontend/
    ├── src/app/
    │   ├── core/            # Guards, interceptors, models, services
    │   ├── features/        # Login, tasks, dashboards, reports, jobs
    │   ├── layouts/         # Main application layout
    │   └── shared/          # Components and utilities reused across features
    ├── angular.json
    ├── proxy.conf.json
    └── package.json
```

## Requirements

Install these tools before running the project:

- Node.js 22.12 or newer
- npm 11 or newer
- MongoDB 5 or newer
- A terminal such as PowerShell

Check the installed versions:

```powershell
node --version
npm --version
mongosh --eval "db.runCommand({ ping: 1 })"
```

## Quick Start

### 1. Start MongoDB

Make sure MongoDB is running on:

```text
mongodb://127.0.0.1:27017
```

You can also use MongoDB Compass or MongoDB Community Server.

### 2. Configure the Backend

Go to the backend directory:

```powershell
cd backend
```

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Open `backend/.env` and set a strong JWT secret:

```dotenv
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/task_management
JWT_SECRET=replace-this-with-a-long-random-secret
NODE_ENV=development
LOG_LEVEL=info
ENABLE_REMINDER_JOB=true
NOTIFICATION_RETENTION_DAYS=0
```

`JWT_SECRET` signs login tokens. Use a long, random value and never commit the real secret.

### 3. Install and Start the Backend

```powershell
npm ci
npm start
```

The API will be available at:

- <http://localhost:5000>
- <http://localhost:5000/api>

For backend development with automatic restart:

```powershell
npm run dev
```

### 4. Install and Start the Frontend

Open a second terminal:

```powershell
cd frontend
npm ci
npm start
```

Open <http://localhost:4200>.

The Angular proxy sends requests beginning with `/api` to `http://localhost:5000`.

## First-Time Use

1. Open <http://localhost:4200>.
2. Select **Sign Up**.
3. Create a regular user account.
4. Sign in using the registered email and password.
5. Open **Tasks** to create or manage tasks.
6. Open **Notifications**, **Activity**, **Reports**, or **Jobs** from the application navigation.

To use administrator features, create or update an account with the `admin` role in MongoDB. Before production use, create or assign administrator accounts through an approved backend or database process rather than exposing a public role-change endpoint.

## How the Application Works

```text
Angular Browser UI
        |
        | HTTP request with Bearer JWT
        v
Angular Proxy (/api -> localhost:5000)
        |
        v
Express Routes
        |
        v
Authentication / Authorization Middleware
        |
        v
Controllers
        |
        v
Services and Mongoose Models
        |
        v
MongoDB
```

### Request Flow

1. Angular calls an endpoint such as `/api/tasks`.
2. The proxy forwards the `/api` request to the backend.
3. The backend validates the JWT from the `Authorization` header.
4. Route guards and middleware check the user's role and permissions.
5. The controller calls a service or model.
6. MongoDB stores or returns the data.
7. The backend sends a JSON response.
8. Angular displays the result in a component.

## Frontend Structure

The frontend uses standalone Angular components and lazy-loaded routes.

| Folder | Purpose |
|---|---|
| `core/guards` | Protect routes and roles |
| `core/interceptors` | Attach authentication tokens to API requests |
| `core/services` | Communicate with backend endpoints |
| `core/models` | Define TypeScript data shapes |
| `features/auth` | Login and registration |
| `features/dashboard` | User and administrator dashboards |
| `features/tasks` | Task list, form, and details |
| `features/notifications` | Notification management |
| `features/activity` | Task activity history |
| `features/reports` | Report generation |
| `features/jobs` | Background job status |
| `layouts` | Shared application shell and navigation |
| `shared` | Reusable UI and utility code |

Important frontend files:

- `frontend/src/app/app.routes.ts` — page routes and route guards
- `frontend/src/app/app.config.ts` — Angular providers and PrimeNG setup
- `frontend/src/app/core/constants/api.constants.ts` — backend API URLs
- `frontend/proxy.conf.json` — frontend-to-backend proxy configuration

## Backend Structure

| Folder | Purpose |
|---|---|
| `routes/` | Maps URLs to controller methods |
| `controllers/` | Handles HTTP requests and responses |
| `services/` | Implements business logic |
| `models/` | Defines MongoDB collections and schemas |
| `middleware/` | Authentication, rate limiting, and errors |
| `events/` | Task events and outbox delivery |
| `jobs/` | Reminder scheduling |
| `workers/` | Processes persistent background jobs |
| `config/` | Database and environment configuration |
| `test/` | Unit and integration tests |

Important backend files:

- `backend/server.js` — application startup and graceful shutdown
- `backend/src/app.js` — Express application and route registration
- `backend/src/routes/` — API route definitions
- `backend/src/config/db.js` — MongoDB connection
- `backend/src/config/env.js` — required environment validation

## API Overview

The API uses JSON and JWT bearer authentication.

```http
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Register an account |
| `POST` | `/api/auth/login` | Sign in and receive a JWT |
| `GET` | `/api/dashboard` | Get dashboard data |
| `POST` | `/api/tasks` | Create a task |
| `GET` | `/api/tasks` | List tasks |
| `GET` | `/api/tasks/:id` | Get task details |
| `PATCH` | `/api/tasks/:id` | Update a task |
| `PATCH` | `/api/tasks/:id/assign` | Assign a task |
| `DELETE` | `/api/tasks/:id` | Delete a task |
| `GET` | `/api/notifications` | List notifications |
| `PATCH` | `/api/notifications/:id/read` | Mark one notification as read |
| `PATCH` | `/api/notifications/read-all` | Mark all notifications as read |
| `POST` | `/api/reports/generate` | Generate a report job |
| `POST` | `/api/exports/json` | Start a JSON export |
| `POST` | `/api/exports/csv` | Start a CSV export |
| `GET` | `/api/exports` | List export records |
| `GET` | `/api/exports/:id` | Get export details |
| `GET` | `/api/exports/:id/download` | Download a completed export |
| `GET` | `/api/jobs` | List background jobs |
| `GET` | `/api/jobs/:id` | Get job status |
| `GET` | `/api/jobs/stats` | Get job statistics |

Protected task, export, notification, report, and job operations require a valid JWT.

## Environment Variables

The backend environment template is `backend/.env.example`.

| Variable | Required | Description |
|---|---:|---|
| `PORT` | No | Backend port. Default: `5000` |
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret used to sign and verify JWT tokens |
| `NODE_ENV` | No | Runtime mode, such as `development` |
| `LOG_LEVEL` | No | Log detail level |
| `ENABLE_REMINDER_JOB` | No | Enables scheduled reminder checks |
| `NOTIFICATION_RETENTION_DAYS` | No | Notification retention period; `0` disables automatic deletion |
| `EXPORT_ROOT` | No | Directory containing generated export files |
| `TEST_MONGO_URI` | No | MongoDB server used by integration tests |

## Testing

### Backend

```powershell
cd backend
npm run lint
npm run test:unit
npm run test:integration
npm test
```

- `npm run lint` checks JavaScript syntax.
- `npm run test:unit` runs unit suites.
- `npm run test:integration` runs MongoDB integration suites.
- `npm test` runs all suites.

The integration runner uses a uniquely named disposable database and does not use the application's normal database.

### Frontend

```powershell
cd frontend
npm run build
npm test -- --watch=false
```

The Angular build creates production files in `frontend/dist/frontend`.

## Common Commands

Run these commands from the matching directory.

### Backend

```powershell
npm start
npm run dev
npm run lint
npm test
npm run verify:indexes
```

### Frontend

```powershell
npm start
npm run build
npm test -- --watch=false
```

## Troubleshooting

### MongoDB connection fails

- Confirm MongoDB is running.
- Confirm `MONGO_URI` is correct.
- Default local connection: `mongodb://127.0.0.1:27017/task_management`.
- Restart MongoDB, then restart the backend.

### Backend reports missing configuration

Confirm `backend/.env` exists and contains:

```dotenv
MONGO_URI=...
JWT_SECRET=...
```

### Frontend cannot call the backend

- Confirm the backend is running on port `5000`.
- Confirm the frontend is running on port `4200`.
- Confirm `frontend/proxy.conf.json` contains the `/api` proxy to `http://localhost:5000`.
- Restart `npm start` after proxy or environment changes.

### Port already in use

Stop the process using the port or change the backend `PORT` value.

```powershell
npm start
```

If Angular requests a different port, use the URL printed in the terminal.

### Login fails

- Confirm both backend and frontend are running.
- Confirm the account was registered successfully.
- Check that `JWT_SECRET` is configured.
- Register the account again if it was created only in a stopped or reset database.

## Security Notes

- Keep `.env` and JWT secrets private.
- Never commit real database credentials.
- Keep export directories private.
- Use strong passwords.
- JWT tokens should be sent through the authorization header.
- Use a process supervisor for production restarts.
- Use a separate database and credentials for testing and production.
- Do not expose MongoDB directly to untrusted networks.

## Learning Map

A beginner can understand the project in this order:

1. Start with `frontend/src/app/app.routes.ts` to see which pages exist.
2. Open `frontend/src/app/core/constants/api.constants.ts` to see API URLs.
3. Open `frontend/src/app/features/tasks/` to follow the task UI.
4. Move to `backend/src/app.js` to see how Express routes are registered.
5. Open `backend/src/routes/taskRoutes.js` to see task endpoints.
6. Follow each route into its controller.
7. Study the matching model in `backend/src/models/`.
8. Inspect `backend/test/` to see the expected behavior.
9. Explore background jobs and events after learning the basic CRUD flow.

## Documentation

- Frontend guide: [frontend/README.md](frontend/README.md)
- Frontend API integration: [frontend/docs/API_INTEGRATION.md](frontend/docs/API_INTEGRATION.md)
- Backend guide: [backend/README.md](backend/README.md)
- Backend hardening findings: [backend/docs/HARDENING_FINDINGS.md](backend/docs/HARDENING_FINDINGS.md)
- Validation status: [backend/docs/VALIDATION.md](backend/docs/VALIDATION.md)
