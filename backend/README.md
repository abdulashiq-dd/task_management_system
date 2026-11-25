# Task Management API — hardened Milestone 10

Node.js / Express / MongoDB task management API, based on merged commit `cfffb36` (Milestones 1–10). This branch is a hardening candidate, not a production certification. The changes preserve the core API and introduce durable jobs and task-event delivery for a **single active application instance**.

## Apply to the existing repository

Use the companion `backend-hardening.patch` from the repository root on your `fix/backend-hardening` branch. Stop the backend first, ensure `git status --short` is empty, back up your MongoDB data and export directory, then run:

```powershell
# From the repository root (one directory above backend)
git branch --show-current
git apply --check --whitespace=nowarn "$HOME\Downloads\backend-hardening.patch"
# Only if the check succeeds:
git apply --whitespace=nowarn "$HOME\Downloads\backend-hardening.patch"
git status --short
cd backend
npm ci
npm run lint
npm test
```

Use the actual download location if different. Do not use `git reset --hard` or overwrite your `.env`; the patch does not change it. The complete ZIP is a source snapshot with `backend/` and the repo-root `.github/workflows/backend-ci.yml`; do not unzip it over your working tree unless you also remove obsolete `src/examples/` files. The patch handles moves automatically. The review recommended separate commits; after verification, stage by logical change where practical, with Conventional Commit messages. The patch contains changes together because the queue, outbox and worker are coupled.

## Run

Requirements: Node.js 22.12+ (22 LTS recommended); MongoDB 5.0+ (MongoDB 8 used in the CI workflow); private writable export folder. Run one server per database. A Mongo lease prevents ordinary accidental double startup and coordinates restart recovery. It is not a fencing protocol for arbitrary multi-host network partitions or clock skew. Do not scale this implementation horizontally.

If setting up from scratch, copy `.env.example` to `.env` and set `MONGO_URI` and a strong random `JWT_SECRET` before starting. Retain your existing `.env` when upgrading. `npm ci` uses the existing dependency lockfile without additional runtime packages.

```powershell
npm run dev
```

The server creates required indexes, recovers interrupted jobs, reconciles orphaned nonterminal export records, and starts the worker/reminder/outbox schedulers. The `npm run dev` script explicitly selects development mode and skips the runtime lease, so nodemon restarts and local debugging pauses do not terminate the API on a missed heartbeat. Keep development to one API process because its background schedulers are process-local. In production (`NODE_ENV=production`), the server acquires an exclusive runtime lease and still exits if it cannot confirm ownership; supervise it and do not manually delete a live lease. The queue records and export metadata persist in MongoDB; keep export files on persistent storage separately. The default export folder is `backend/exports/`; `EXPORT_ROOT` can override it. This is not a shared-filesystem/multi-instance deployment solution.

## Combined testing (no Postman or credentials required)

Keep MongoDB running locally; stop the normal backend while performing upgrade validation. `npm test` creates a unique database named `task_hardening_test_<uuid>`, seeds disposable users and tasks, uses a temporary export directory, runs all suites in separate Node processes, and drops only that database after the run. It never uses the application `MONGO_URI` to select a test database. To use another authorized development/test server, set `TEST_MONGO_URI` to its connection URI in the environment; do not point it at production. It must permit creation and deletion of a disposable database, including indexes. Tests can leave the uniquely named test database behind if forcibly killed; do not drop other databases.

```powershell
npm run lint             # syntax-only, dependency-free JS validation
npm run test:unit        # 8 legacy suites plus new unit tests
npm run test:integration # 9 legacy suites plus new integration groups; requires MongoDB
npm test                 # all 19 suites in one run
```

The original 17 assertion-based suites are in `test/legacy/`. Two learning-only scripts remain in `learning-examples/`. Direct runs of MongoDB suites are guarded; use `npm test` to avoid connecting to a live database. The persistent-queue API suite and the new integration suite use real MongoDB; older in-memory exercises still use `JobQueue` for learning/regression. CI runs syntax and all tests in an isolated MongoDB service. ESLint / Prettier configurations are included for optional IDE/tooling use, but `npm run lint` does **not** execute ESLint. Install those development tools separately if desired.

## API contracts / upgrade notes

- Existing task, auth, dashboard, notification, job, report and export endpoints remain. Task POST/PATCH now reject unknown and protected fields (`createdBy`, `assignedTo`, overdue fields, internal outbox, Mongo update operators). Assign with `PATCH /api/tasks/:id/assign` after create. A concurrent modification may return 409; refresh and retry. A delete may return 409 while its pending events wait for delivery.
- Creator and assignee can read a task; creator/admin can update, assign and delete. Other users receive 403 for known task IDs. Exports/jobs use owner-scoped 404 to avoid disclosing their existence.
- `/api/notifications`, `/api/activity` and `/api/jobs`: use `?page=1&limit=20` (default 20, max 100), with `pagination` response metadata. Existing array fields and `count` are retained; the count is the page length, not the total. Activity can be filtered by `eventType` and is limited to tasks visible to the authenticated user. Jobs additionally support `status` and `type`. Client should use `pagination.total` / `hasNextPage`. Notification internal deduplication/job keys are not exposed. Notification `mark as read` and dashboard activity are projected.
- Export/report POST returns 202 after submission. Poll `/api/jobs/:id`, then download `/api/exports/:id/download` on completion. Jobs now carry an owner ID rather than a role; current role is loaded at execution and checked again before publishing privileged output. Newly generated files record their access scope. **Old Milestone 10 completed exports have unknown scope**, so regular users must regenerate them; administrators retain access. Do not bulk-mark old artifacts as user-scope without verifying their contents. Likewise, admin-scope output is not accessible by a demoted user.
- Per-IP login limit is 30 attempts / 15 min; registration limit 10 / 15 min. The built-in bounded limiter deliberately uses no added dependency. It is local to the supported single process; configure proxy trust and an upstream/shared rate limiter if deployed behind a proxy or exposed publicly. Bcrypt comparison is performed for nonexistent accounts too; this mitigates, but does not mathematically eliminate, timing differences.
- Background jobs: up to 1,000 active, with no more than 800 interactive export/report jobs, and 20 active interactive jobs per user. Activity/notification jobs have priority and unused capacity; a full queue defers persisted task events instead of dropping them. Existing running exports are not preempted. Completed/failed job records are retained about seven days (MongoDB TTL is asynchronous); export records/files have separate lifetimes.
- A 120-second worker deadline uses fail-stop for the durable production queue because racing an uncancelled MongoDB/filesystem operation and immediately retrying could create inconsistent writes. On restart, processing jobs become retryable until their existing budget is exhausted, then fail. The old educational in-memory worker uses a nonretryable timeout. Configure a process supervisor in deployment. True cooperative cancellation, fencing of every external write, multi-instance workers and shared storage are future work.
- Pending task events are embedded in the same task document as task mutations (including both completion and update events). IDs are deterministic for each event's activity/notification delivery, and outbox entries are removed only after durable acceptance. A backlog cap rejects further mutations with 409 instead of growing an unbounded task document. Deletion waits for pending events to be accepted. The outbox is intentionally standalone-Mongo compatible, not a cross-collection transaction. Delivery job history is TTL-limited, but notification and activity idempotency indexes remain. Inspect queue/outbox metrics for persistent failures; a failed business operation is not silently considered successful merely because a job was accepted. The current outbox has a bounded 100-task sweep and no dedicated operator dashboard/dead-letter UI.

## Database/index upgrade

Startup builds the new required indexes; no automatic index-dropping or database reset. Before production use, take a backup, test on a copy, and run:

```powershell
npm run verify:indexes
# Optional, after verifying the replacement compound notification index exists:
npm run migrate:indexes -- --confirm
```

The read-only verification reports index definitions and sample `explain('executionStats')` results for task queries. Check query plans on a realistic dataset; small collections may legitimately choose COLLSCAN. The optional migration only drops known redundant nonunique notification indexes after detecting the replacement. It changes the configured database, so review its target before running. Do not run `syncIndexes()` indiscriminately. Existing overdue tasks already marked true but missing notifications should be audited separately; reset flags only for specifically verified missing notifications. No automatic historical repair/deletion is included.

## Product decisions preserved

1. Overdue means an incomplete task with a non-null due instant less than or equal to now. Date-only strings still resolve to UTC midnight. Local end-of-day semantics require a product decision and timezone design.
2. Reminder deduplication includes task, recipient, type and due date. Changing the due date or recipient may trigger a new notification. Same key remains deduplicated.
3. Historical notification retention defaults to disabled (`NOTIFICATION_RETENTION_DAYS=0`). Opt in only after agreeing on retention/privacy requirements and the deduplication impact. Setting a positive value creates a TTL index on `createdAt`; MongoDB may delete old records promptly. Changing/removing an existing TTL index requires an explicit `collMod` or index drop, not just changing `.env`.
4. Priority updates continue to use `taskUpdated` activities with before/after priority; separate `priorityChanged` activity events are not introduced without agreement. Priority-change notifications remain.

## Operational limits

No high-availability claim: a single process with synchronized clock, a Mongo lease and local/shared-to-that-process export storage is the supported topology. Protect MongoDB credentials, use network restrictions/TLS, set log access controls, enforce OS file permissions, configure backups and supervisor-driven restarts. Local rate limits do not cover distributed clients. Upgrades/rollbacks should occur offline; snapshots and job records created by the hardened version are not compatible with the old in-memory worker. Historical export files remain on disk; use a separately approved retention process.

See `docs/HARDENING_FINDINGS.md` for the 38-item resolution tracker and `docs/VALIDATION.md` for the executed versus pending checks.


## Milestones 11 and 12

The class-based `TaskService`, `NotificationService` and `QueueWorker` retain the existing module and API paths. Custom application and queue errors feed a centralized HTTP error normalizer; workers retain independent retry/failure handling. Run `node learning-examples/classServiceDesign.js` for the callback review checkpoint, and `npm test` for all 22 suites. See `docs/MILESTONES_11_12.md` and `docs/VALIDATION_M11_M12.md` for implementation details and actual validation status.
