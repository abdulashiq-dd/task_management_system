# Backend hardening — findings resolution tracker

Source: `Task API Review Findings.pdf`, sections A–F. Baseline: merged Milestone 10 commit `cfffb36`. All 38 findings have been reviewed; implementation status is not equivalent to a passing database/integration test. The report's "Checked and not a problem" items are preserved. No production certification is claimed.

| ID | Finding | Implemented response / remaining action |
|---|---|---|
| A1 | Mass assignment at create | Controller/service whitelist shared; reject protected fields and Mongo operators. Assignment uses dedicated route. Unit pass; permission integration pending. |
| A2 | Service-level update trust | `taskFields` validation in service and explicit `$set`; optimistic version check. Unit pass; integration pending. |
| A3 | False-success assignment | Service resolves race to 404 if removed, 409 if changed/backlogged; controller checks null. Integration pending (missing task test; concurrent race needs additional stress test). |
| A4 | Stale queued role | Queue stores owner ID, lookup at execution for JSON/CSV/report, check again before publishing admin output. Output records store role scope; previous unknown-scope exports blocked for regular users. Integration demotion test pending. |
| A5 | Account timing | Fixed, valid cost-12 bcrypt dummy hash and compare for missing email. Login response remains generic. Integration response test pending; timing benchmark not run. |
| A6 | Login/register rate limit | Bounded per-IP fixed-window implementation, no new package. 30/10 attempts per 15 minutes, 429 + Retry-After. Unit passes; shared limiter required for multi-instance topology. |
| A7 | Missing config reported as auth | Fail startup on missing MONGO_URI/JWT_SECRET; missing secret returns server error. Unit pass; actual startup behavior pending. |
| B1 | In-memory queue | Mongo-backed model and atomic claim, durable state/result/history, restart recovery, isolated in-memory educational queue retained. Exclusive lease and one-server boundary. Integration pending. |
| B2 | Global queue starvation | Interactive cap 800/1,000 and 20 active per user; activity/notification priority and reserved capacity; outbox handles admission failure. Integration pending; load stress pending. |
| B3 | Hung jobs | 120-second deadline; production fail-stop to avoid racing uncancelled writes, durable recovery under supervisor; educational nonretryable timeout. Unit timeout classification passes; integration and real crash/restart pending. |
| B4 | Simulated five-second report delay | Removed in legacy report handler; reports execute real database/file work. Integration pending. |
| B5 | Multiple reminder schedulers | Single active backend per DB enforced by renewable runtime lease, optional `ENABLE_REMINDER_JOB=false`, scheduler awaits active check on stop. Lease is not full distributed fencing. Integration pending. |
| B6 | Repeated overdue scans | Exclude flagged tasks; stream upcoming/overdue using batch cursors; notification before flag so failure retains eligibility; reset when due date/status/assignee changes. Integration pending; inspect historical flags separately. |
| B7 | Listener failure drops events | Embedded outbox written atomically with task create/update/assignment, deterministic job IDs, recover via polling and backpressure. Delete waits for accepted events. Unit mapping pass; outage/delivery integration pending. |
| B8 | Listener rereads task | Event snapshot includes title and recipient. Pure event-to-job mapping uses snapshot. Unit pass; integration pending. |
| B9 | Unsafe console listener | Dev-only observer, guarded payload, errors isolated; no user values logged. Code inspection/syntax pass. |
| B10 | Cross-user job eviction | Persistent completed jobs get seven-day TTL; no busy-user eviction from production queue. TTL asynchronous; integration/load test pending. |
| C1 | Missing task indexes | Index creator/status, assignee/status, overdue scan. `npm run verify:indexes` reports explain plans; run locally. |
| C2 | Dashboard loads all visible IDs | Aggregation lookup against task visibility replaces large distinct/$in; preserves deleted-task exclusion for admins too. Integration/performance validation pending. |
| C3 | Dashboard round trips | One conditional group for totals/priority plus independent activity aggregation (two aggregate calls). Integration/performance validation pending. |
| C4 | Unbounded notification list / internal fields | Paginate, stable sorting, projection, optional TTL. Unit pagination passes; integration pending. Historical deletion remains opt-in policy decision. |
| C5 | Unbounded jobs list | Production DB-level limit/skip, owner filter and status/type filter, counts for pagination; memory API slices. Unit pagination pass; integration pending. |
| C6 | Redundant notification index | Remove schema-level single index; replacement `{user,createdAt,_id}`. Existing database indexes need explicit opt-in `npm run migrate:indexes -- --confirm` after verification. |
| D1 | Duplicate errors always email | Field-specific 409 using safe `keyPattern` field names, generic fallback. Unit pass. |
| D2 | Register without body crashes | Safe body fallback and validation; login length bounded. Integration pending. |
| D3 | Dashboard masks client errors | Return safe client error message for 4xx; generic server failure. Code/syntax pass; integration pending. |
| D4 | Stack traces lost | Structured logger captures error type, numeric code and stack frames without raw potentially sensitive messages. Code/syntax pass. |
| D5 | Loose job payload validation | Notification type allowlist, nonblank string <=4096; activity event enum; runtime export owner validation. Integration pending. |
| E1 | Console logs and user data | Built-in structured JSON logger with levels, error stack frames and no raw payload/task titles; all runtime console calls replaced. Logging verification in deployed environment pending. |
| E2 | Duplicate helpers | Shared task visibility, auth checks, HTTP errors, field allowlist and pagination. Some service-specific wrappers retained for established response semantics. Unit/syntax pass. |
| E3 | Dead code | Remove empty EventEmitter constructor; retain generic retry utility because the Milestone 9 retry tests use it. No unjustified deletion. Legacy retry suite passed. |
| E4 | Interval not unref'd | Reminder and outbox interval unref'd; stop waits in-flight work. Runtime lease/worker timers intentionally keep service lifecycle active. Integration pending. |
| E5 | Activity enum/index gaps | Add task/createdAt and global recent-activity indexes. Preserve priority change details under taskUpdated; separate priorityChanged event requires product agreement. |
| F1 | No test script | The original 167 cases existed as runnable examples; new npm test executes those 17 suites and new unit/integration suites. Permission matrix, quota, persisted claims, demotion, outbox and timeout coverage added. 57 cases executed here; full local run pending. |
| F2 | Tests inside src | Move assertion suites to test/legacy and learning-only examples outside runtime; isolated DB runner and guards. Syntax and dependency-free cases passed. |
| F3 | Missing project files | README, env example, syntax check, ESLint/Prettier configuration, Dockerfile, repo-root CI workflow. Package main/start/test/description corrected. Full ESLint and Docker/CI builds not executed. |
| F4 | Due-date semantics | Product decision: preserve due-instant/UTC behavior and document; no silent end-of-day conversion. Confirm with team. |
| F5 | Reminder dedup after changing due date | Product decision: preserve key including due date and recipient; document behavior and test same-key dedup. Confirm with team. |

## Verification gate

- Pass `npm test`, including the Mongo integration suites, before committing/merging.
- Start server with an existing database copy; verify lease, index creation, restart job recovery and retained data.
- Check `npm run verify:indexes`, inspect real plans and apply the optional redundant-index migration only after review.
- Confirm frontend pagination/create assignment changes and product decisions F4/F5, C4 retention, E5 event policy.
- For actual production rollout, run restart/kill, concurrent task updates, network fault and load tests with real dependencies; ensure log/operational monitoring and persistent storage.
