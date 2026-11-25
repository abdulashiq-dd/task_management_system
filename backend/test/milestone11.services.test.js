const test = require("node:test");
const assert = require("node:assert/strict");
const taskService = require("../src/services/taskService");
const notificationService = require("../src/services/notificationService");
const { ActivityService } = require("../src/services/activityService");
const { TaskService } = taskService;
const { NotificationService } = notificationService;
const { QueueWorker, JobWorker } = require("../src/workers/jobWorker");
const { JobQueue, JOB_TYPES } = require("../src/queues/jobQueue");
const { AuthorizationError, ValidationError, NotFoundError } = require("../src/utils/httpError");
const { NonRetryableError, RetryableError } = require("../src/utils/jobErrors");
const { sleep } = require("../src/utils/retry");
process.env.LOG_LEVEL = "silent";
const ID = "64a000000000000000000001";
const OTHER = "64a000000000000000000002";
const TASK = "64a000000000000000000003";
const current = { id: ID, role: "user" };

async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(10);
  }
  assert.fail("Timed out waiting for worker");
}

test("M11: shared services are class instances and JobWorker alias remains compatible", () => {
  assert.ok(taskService instanceof TaskService);
  assert.ok(notificationService instanceof NotificationService);
  assert.equal(QueueWorker, JobWorker);
});

test("M11: injected Task model and outbox; bound create method works as callback", async t => {
  const validate = t.mock.fn(async () => {});
  const save = t.mock.fn(async () => {});
  class FakeTask {
    constructor(fields) { Object.assign(this, fields, { _id: TASK, status: "pending", priority: "medium" }); }
    validate() { return validate(); }
    save() { return save(); }
  }
  const event = { id: "event-1" };
  const makeEvent = t.mock.fn(() => event);
  const flushBestEffort = t.mock.fn(async () => {});
  const service = new TaskService({ taskModel: FakeTask, outbox: { makeEvent, flushBestEffort } });
  const callback = service.createTask;
  const result = await callback({ title: "Mock task" }, current);
  assert.equal(result.createdBy, ID);
  assert.deepEqual(result.pendingEvents, [event]);
  assert.equal(validate.mock.callCount(), 1);
  assert.equal(save.mock.callCount(), 1);
  assert.deepEqual(flushBestEffort.mock.calls[0].arguments, [TASK]);
  assert.equal(makeEvent.mock.calls[0].arguments[0], "taskCreated");
  await assert.rejects(callback({ title: "blocked", createdBy: OTHER }, current), ValidationError);
  assert.equal(save.mock.callCount(), 1);
});

test("M11/M12: task service denies unauthorized reads and propagates rejected database promise", async t => {
  const findById = t.mock.fn(async () => ({ _id: TASK, createdBy: OTHER, assignedTo: null }));
  const service = new TaskService({ taskModel: { findById } });
  await assert.rejects(service.getTaskById(TASK, current), AuthorizationError);
  assert.equal((await service.getTaskById(TASK, { id: ID, role: "admin" }))._id, TASK);
  await assert.rejects(service.getTaskById("bad", current), ValidationError);
  assert.equal(findById.mock.callCount(), 2);
  const original = new Error("database unavailable");
  const broken = new TaskService({ taskModel: { findById: async () => { throw original; } } });
  await assert.rejects(broken.getTaskById(TASK, current), error => error === original);
});

test("M11: injected Notification model and idempotent write preserve ownership and arguments", async t => {
  const payload = { user: ID, task: TASK, type: "taskAssigned", message: "Assigned" };
  const model = { create: t.mock.fn(async data => data), findOneAndUpdate: t.mock.fn(async () => null) };
  const write = t.mock.fn(async (_model, id, data) => ({ ...data, backgroundJobId: id }));
  const service = new NotificationService({ notificationModel: model, idempotentWrite: write });
  const callback = service.createNotification;
  assert.deepEqual(await callback(payload), { ...payload, isRead: false });
  assert.equal((await callback({ ...payload, backgroundJobId: "job-1" })).backgroundJobId, "job-1");
  assert.equal(model.create.mock.callCount(), 1);
  assert.equal(write.mock.callCount(), 1);
  assert.equal(write.mock.calls[0].arguments[0], model);
  await assert.rejects(service.markNotificationAsRead(TASK, ID), NotFoundError);
  assert.deepEqual(model.findOneAndUpdate.mock.calls[0].arguments[0], { _id: TASK, user: ID });
  await assert.rejects(callback({ ...payload, task: "bad" }), ValidationError);
});

test("M11: notification listing supports a validated read-status filter", async t => {
  const find = t.mock.fn(() => ({
    select() { return this; },
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    lean: async () => [],
  }));
  const countDocuments = t.mock.fn(async () => 0);
  const service = new NotificationService({
    notificationModel: { find, countDocuments },
  });

  await service.getUserNotifications(ID, { isRead: "false" });
  assert.deepEqual(find.mock.calls[0].arguments[0], { user: ID, isRead: false });
  assert.deepEqual(countDocuments.mock.calls[0].arguments[0], { user: ID, isRead: false });
  await assert.rejects(
    service.getUserNotifications(ID, { isRead: "yes" }),
    ValidationError,
  );
});

test("M11: activity listing paginates visible task history and validates event filters", async t => {
  const aggregate = t.mock.fn(async () => [
    { activities: [{ taskTitle: "Visible task" }], total: [{ count: 6 }] },
  ]);
  const service = new ActivityService({
    activityModel: { aggregate },
    taskModel: { collection: { name: "tasks" } },
  });

  const result = await service.getActivity(current, {
    page: "2",
    limit: "3",
    eventType: "taskUpdated",
  });
  assert.deepEqual(result, {
    activities: [{ taskTitle: "Visible task" }],
    pagination: {
      page: 2,
      limit: 3,
      total: 6,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    },
  });

  const pipeline = aggregate.mock.calls[0].arguments[0];
  assert.deepEqual(pipeline[0], { $match: { eventType: "taskUpdated" } });
  const lookup = pipeline.find(stage => stage.$lookup)?.$lookup;
  assert.equal(lookup.from, "tasks");
  const visibility = lookup.pipeline[0].$match.$or;
  assert.equal(String(visibility[0].createdBy), ID);
  assert.equal(String(visibility[1].assignedTo), ID);
  await assert.rejects(
    service.getActivity(current, { eventType: "notAnEvent" }),
    ValidationError,
  );
});

test("M11: separate service instances do not share injected dependencies", async () => {
  const make = value => new NotificationService({ notificationModel: { updateMany: async () => ({ modifiedCount: value }) } });
  assert.deepEqual(await make(1).markAllNotificationsAsRead(ID), { modifiedCount: 1 });
  assert.deepEqual(await make(2).markAllNotificationsAsRead(ID), { modifiedCount: 2 });
});

test("M11/M12: worker callback succeeds, retries safely, and records permanent failure", async t => {
  const queue = new JobQueue({ maxRetries: 1, retryDelay: 1 });
  const handler = t.mock.fn(async job => {
    if (job.payload.kind === "fatal") throw new NonRetryableError("invalid payload");
    if (job.payload.kind === "retry" && job.attempts === 1) throw new RetryableError("temporary");
    return { done: true };
  });
  const worker = new QueueWorker({ queue, handler, concurrency: 1, pollIntervalMs: 5 });
  worker.start();
  try {
    // Enqueue after start, so the interval really exercises the bound method reference.
    const ok = queue.enqueue(JOB_TYPES.ACTIVITY_LOG, { kind: "ok" });
    const retry = queue.enqueue(JOB_TYPES.ACTIVITY_LOG, { kind: "retry" });
    const bad = queue.enqueue(JOB_TYPES.ACTIVITY_LOG, { kind: "fatal" });
    await until(() => queue.getJob(ok.id).status === "completed" && queue.getJob(retry.id).status === "completed" && queue.getJob(bad.id).status === "failed");
    assert.equal(queue.getJob(retry.id).attempts, 2);
    assert.equal(queue.getJob(bad.id).attempts, 1);
    assert.equal(handler.mock.callCount(), 4);
    const stats = worker.getStats(); stats.completed = -1;
    assert.equal(worker.getStats().completed, 2);
    const snapshot = worker.inFlightJobs; snapshot.add("not an actual job");
    assert.equal(worker.inFlightJobs.has("not an actual job"), false);
  } finally { await worker.stop(); }
  assert.equal(worker.activeJobs, 0);
  assert.equal(worker.isRunning, false);
  assert.equal(worker.inFlightJobs.size, 0);
});
