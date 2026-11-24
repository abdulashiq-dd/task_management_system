// Executed only by test/run.js, with its generated disposable MongoDB database.
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");
if (!/\/task_hardening_test_[a-f0-9]{32}(?:\?|$)/.test(process.env.MONGO_URI || "")) throw new Error("Run through npm test only");
process.env.JOB_QUEUE_MODE = "mongo";
const app = require("../src/app");
const Task = require("../src/models/taskModel");
const User = require("../src/models/userModel");
const BackgroundJob = require("../src/models/backgroundJobModel");
const { jobQueue, JOB_TYPES } = require("../src/queues/jobQueue");
const { QueueWorker } = require("../src/workers/jobWorker");
const { sleep } = require("../src/utils/retry");
const { NonRetryableError } = require("../src/utils/jobErrors");

let server, base, owner, outsider, worker;
const jwtFor = user => jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "1h" });
async function request(method, path, user, body, raw = false) {
  const headers = user ? { Authorization: `Bearer ${jwtFor(user)}` } : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

test.before(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  if (!/^task_hardening_test_[a-f0-9]{32}$/.test(mongoose.connection.name)) throw Error("Unexpected test database");
  await Promise.all([Task.createIndexes(), User.createIndexes(), BackgroundJob.createIndexes()]);
  // The runner already created these two fixture identities.
  owner = await User.findOne({ email: process.env.TEST_USER_EMAIL });
  outsider = await User.create({ name: "M12 outsider", email: `${randomUUID()}@example.invalid`, password: "unused-fixture-hash", role: "user" });
  assert.ok(owner);
  await new Promise((resolve, reject) => { server = app.listen(0, "127.0.0.1", resolve); server.once("error", reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (worker) await worker.stop();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
});

test("M12 HTTP: valid task succeeds; schema validation, malformed JSON and invalid ID return 400", async () => {
  const created = await request("POST", "/api/tasks", owner, { title: "M12 valid task" });
  assert.equal(created.status, 201);
  assert.equal((await request("GET", `/api/tasks/${created.body.task._id}`, owner)).status, 200);
  const invalid = await request("POST", "/api/tasks", owner, { title: "M12 invalid", status: "private-invalid-status" });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body, { message: "Validation failed" });
  const malformed = await request("POST", "/api/tasks", owner, '{"title":', true);
  assert.equal(malformed.status, 400);
  assert.deepEqual(malformed.body, { message: "Malformed JSON request" });
  assert.equal((await request("GET", "/api/tasks/not-an-id", owner)).status, 400);
});

test("M12 HTTP: unauthorized, forbidden and missing resources retain their status codes", async () => {
  const task = await Task.create({ title: "M12 private task", createdBy: owner._id });
  assert.equal((await request("GET", `/api/tasks/${task._id}`, null)).status, 401);
  assert.equal((await request("GET", `/api/tasks/${task._id}`, outsider)).status, 403);
  assert.equal((await request("GET", `/api/tasks/${new mongoose.Types.ObjectId()}`, owner)).status, 404);
  const badExport = await request("GET", `/api/exports/${new mongoose.Types.ObjectId()}`, owner);
  assert.equal(badExport.status, 404);
  assert.deepEqual(badExport.body, { success: false, message: "Export not found" });
});

test("M12 HTTP: duplicate registration returns 409; rejected database promise is sanitized", async t => {
  const duplicate = await request("POST", "/api/auth/register", null, { name: "Duplicate fixture", email: owner.email, password: "test-password-123" });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(duplicate.body, { message: "Email already registered" });
  // Mock one dependency only for the next HTTP request; restore it in finally.
  const secret = "private-db-error-test-marker";
  const replacement = t.mock.method(Task, "findById", async () => {
    throw Object.assign(new Error(secret), { name: "MongoNetworkError" });
  });
  try {
    const result = await request("GET", `/api/tasks/${new mongoose.Types.ObjectId()}`, owner);
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { message: "Internal server error" });
  } finally { replacement.mock.restore(); }
});

test("M12 HTTP: rejected background job persists failure and API does not expose payload/error", async () => {
  const marker = `m12-private-${randomUUID()}`;
  const queued = await jobQueue.enqueue(JOB_TYPES.ACTIVITY_LOG, { marker }, String(owner._id));
  // Dedicated worker using a controlled handler; only the exact fixture ID may be claimed.
  // A narrow injected queue facade delegates the actual state transitions to MongoJobQueue.
  const queue = {
    persistent: true,
    dequeue: () => BackgroundJob.findOneAndUpdate({ id: queued.id, status: "pending" }, { $set: { status: "processing", startedAt: new Date(), lastAttemptAt: new Date() }, $inc: { attempts: 1 } }, { returnDocument: "after" }).lean(),
    getJob: id => jobQueue.getJob(id),
    markFailed: (...args) => jobQueue.markFailed(...args),
    markCompleted: (...args) => jobQueue.markCompleted(...args),
  };
  worker = new QueueWorker({ queue, handler: async () => { throw new NonRetryableError(marker); }, pollIntervalMs: 10 });
  worker.start();
  try {
    const deadline = Date.now() + 10000;
    let row;
    while (Date.now() < deadline) {
      row = await jobQueue.getJob(queued.id);
      if (row?.status === "failed") break;
      await sleep(20);
    }
    assert.equal(row?.status, "failed");
    assert.equal(row.attempts, 1);
    assert.equal(row.isPermanentlyFailed, true);
    const res = await request("GET", `/api/jobs/${queued.id}`, owner);
    assert.equal(res.status, 200);
    assert.equal(res.body.job.status, "failed");
    assert.equal(res.body.job.error, "Job execution failed");
    assert.equal(JSON.stringify(res.body).includes(marker), false);
    assert.equal((await request("GET", `/api/jobs/${queued.id}`, outsider)).status, 404);
  } finally { await worker.stop(); worker = null; }
});
