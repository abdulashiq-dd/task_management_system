# Milestones 11 and 12 — Class-based services and centralized errors

Baseline: merged hardening commit `b3d5bac6177d9cd9273cfebba4e4d160ffd61bc8` (PR #9). This update does not change the database schema, indexes, dependency versions, environment variables, or API paths. It preserves the hardened queue and outbox; the original `JobWorker` export remains an alias of `QueueWorker`.

## 11. Classes, `this` and service design

| Requirement | Implementation / evidence |
|---|---|
| Refactor services into classes | `src/services/taskService.js`, `src/services/notificationService.js`. Existing module imports return a shared class instance; named constructors are available for isolated tests. |
| TaskService | Constructor-injected task model, user model and outbox. Existing task CRUD, search, permissions, version checks and durable event writes retained. Private dependencies and helpers. |
| NotificationService | Constructor-injected notification model and idempotent writer. Existing paginated reads, scoped updates and idempotent writes retained. Private dependencies. |
| QueueWorker | Existing worker logic refactored into `QueueWorker` in `src/workers/jobWorker.js`. `JobWorker` is an alias, and `jobWorker` is the singleton. Queue, handler and configuration remain injectable. Worker counters, timers, active promises and lifecycle flags are private; read-only getters/snapshots preserve legacy inspection. |
| Method callbacks / `bind()` | Service methods bind once in constructors to retain compatibility with detached imports. The worker passes its bound `processQueue` method to `setInterval` and `setImmediate`. |
| Lost `this`, wrapper, `call`, `apply`, arrow functions | `learning-examples/classServiceDesign.js`; tests in `test/milestone12.errors.test.js`. |
| Encapsulation | Private fields, constructor injection, read-only lifecycle getters and defensive snapshots; no per-request user state stored on shared services. |
| Service unit tests | `test/milestone11.services.test.js` uses injected fakes and mock functions; no MongoDB connection required, but dependencies must be installed. |

### Review checkpoint

Run `node learning-examples/classServiceDesign.js` from `backend`.

```text
direct: Tasks: 1
lostThis: TypeError
bound: Tasks: 3
wrapper: Tasks: 6
call: Other: 4
apply: Other: 9
count: 6
otherCount: 9
```

A class is a blueprint, a constructor initializes an instance, and a normal method's `this` is determined by how it is invoked. `counter.add` as a callback is an unbound reference. `() => counter.add(3)` preserves the receiver by calling through the object. `bind(counter)` returns a new function with the receiver fixed; `call(other, 4)` invokes immediately with explicit arguments; `apply(other, [5])` invokes immediately with an array of arguments. Arrow functions inherit their surrounding `this`; they do not acquire a new receiver by calling `bind`, `call` or `apply`. `#count` is private. The learning example catches the expected TypeError intentionally; production service methods are already bound.

## 12. Centralized error handling and testing

`src/errors/appError.js` defines `AppError` and subclasses: `ValidationError` (400), `AuthenticationError` (401), `AuthorizationError` (403), `NotFoundError` (404), `ConflictError` (409), `RateLimitError` (429), `ServiceUnavailableError` (503) and `DatabaseError` (500). The compatibility factory `createError(message, statusCode)` returns typed errors without breaking existing service call sites. `src/utils/jobErrors.js` retains retry classification and introduces a shared `QueueProcessingError` superclass and nonretryable `JobTimeoutError`.

`src/errors/normalizeError.js` maps Mongoose validation, cast errors, duplicate keys, database failures and malformed JSON to safe application errors. Raw database error details and invalid submitted values are not returned. Schema validation now returns the public message `Validation failed`; other intentionally public validation messages remain. Unhandled 5xx errors return `Internal server error` (including dashboard failures); trusted typed queue-capacity 503 errors preserve the useful message. The middleware keeps the existing `success: false` envelope for job, dashboard, report and export controller errors, and the message-only response for task/auth/notification and authentication failures. Rate-limit middleware retains its Retry-After header and response. The error handler is registered after Express routes. Download callbacks delegate errors to it, including when a partially transmitted response must be handled by Express.

### Error flow

`Request → authentication / controller → service → rejected promise or thrown error → next(error) → normalizeError → errorHandler → safe HTTP response`

`QueueWorker → handler promise → retry classification → queue state update → completed / retrying / failed → sanitized Job API response`

Express errors and asynchronous worker errors are separate boundaries: HTTP error middleware does not catch background workers. Retry classification, atomic claims, timeout fail-stop for persistent queues and idempotent writes remain intact. Do not wrap every database/worker failure before the retry classifier sees the original error.

### Tests and review checkpoint

| Suite | Coverage |
|---|---|
| `test/milestone12.errors.test.js` (8 cases) | `this` callbacks, error inheritance and mapping, database/input redaction, middleware forwarding, retry classification, resolved and rejected promises, mock call counts. |
| `test/milestone11.services.test.js` (6 cases) | Class instance compatibility, injected model/outbox mocks, bound task/notification callbacks, invalid input, unauthorized access, DB rejection, worker success/retry/failure, encapsulation. |
| `test/milestone12.api.test.js` (4 cases) | Real Express/MongoDB integration, invalid JSON/validation, 401/403/404, duplicate registration 409, deliberately mocked DB rejection 500, durable job failure and ownership/redaction. |

The existing 19 suites remain in the runner. The new suites bring `npm test` to **22 suites**. The runner generates a disposable database and storage directory and never uses the application database. The new API suite uses the same test-run database and an ephemeral port, then disconnects; the runner drops the disposable database. Do not run database integration scripts directly against the application database. The new worker failure integration uses an exact-ID injected queue facade to avoid claiming unrelated fixture jobs while exercising real MongoDB failure updates and HTTP retrieval.

## Local verification and merge gate

From `backend`, with MongoDB running and any application server stopped:

```powershell
npm run lint
node learning-examples/classServiceDesign.js
npm run test:unit
npm test
npm audit
```

`lint` here is the existing syntax checker, not full ESLint. Expect `92/92 JavaScript files passed syntax checks` and `Suites executed: 22; failed: 0` only if the complete run is successful. The CI workflow runs `npm ci`, syntax checks and `npm test` against MongoDB. No dependency updates are needed. If modules are missing run `npm ci` using the unchanged lockfile; preserve your `.env`. Do not merge if local or CI tests fail. Run `npm run dev` afterward for a startup smoke test, then stop it with Ctrl+C. Review frontend compatibility, especially the generic schema-validation message.

The hardening findings tracker and deployment restrictions remain in force; this class/error refactor does not resolve outstanding product decisions, add distributed workers, or certify production readiness. See `docs/VALIDATION_M11_M12.md` for what was actually executed.
