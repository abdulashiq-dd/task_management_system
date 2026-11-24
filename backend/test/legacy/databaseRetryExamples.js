
require("dotenv").config();
if (!/\/task_hardening_test_[a-f0-9]{32}(?:\?|$)/.test(process.env.MONGO_URI || "")) throw new Error("Run database tests through npm test; an isolated database is required.");

const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Notification = require("../../src/models/notificationModel");
const TaskActivity = require("../../src/models/taskActivityModel");

const {
  JobQueue,
  JOB_TYPES,
  JOB_STATUS,
} = require("../../src/queues/jobQueue");

const {
  JobWorker,
} = require("../../src/workers/jobWorker");

const {
  executeJob,
} = require("../../src/workers/jobHandlers");

const {
  RetryableError,
} = require("../../src/utils/jobErrors");

const {
  sleep,
} = require("../../src/utils/retry");

// ==========================================
// TEST CONFIGURATION
// ==========================================

const testUserId = new mongoose.Types.ObjectId();
const testTaskId = new mongoose.Types.ObjectId();

const testJobIds = [];

// ==========================================
// WAIT FOR TEST CONDITION
// ==========================================

async function waitFor(condition, timeout = 10000) {
  const startTime = Date.now();

  while (!condition()) {

    if (Date.now() - startTime >= timeout) {
      throw new Error("Test condition timed out");
    }

    await sleep(20);
  }
}

// ==========================================
// DATABASE RETRY TEST
// ==========================================

async function testDatabaseRetry(
  jobType,
  payload,
  Model
) {

  const queue = new JobQueue({
    maxRetries: 3,
    retryDelay: 100,
  });

  const job = queue.enqueue(
    jobType,
    payload,
    String(testUserId)
  );

  testJobIds.push(job.id);

  let firstResult;

  const worker = new JobWorker({

    queue,

    concurrency: 1,

    pollIntervalMs: 10,

    handler: async (job) => {

      // Execute the actual MongoDB operation.
      const result = await executeJob(job);

      // Simulate failure after successful insertion.
      if (job.attempts === 1) {

        firstResult = result;

        console.log(
          "[Simulation] Database write succeeded"
        );

        console.log(
          "[Simulation] Connection lost after write"
        );

        throw new RetryableError(
          "Simulated connection failure after write"
        );
      }

      return result;
    },
  });

  try {

    worker.start();

    await waitFor(() =>
      job.status === JOB_STATUS.COMPLETED ||
      job.status === JOB_STATUS.FAILED
    );

    assert.equal(
      job.status,
      JOB_STATUS.COMPLETED
    );

    assert.equal(job.attempts, 2);

    assert.equal(job.retryCount, 1);

    assert.equal(job.errorHistory.length, 1);

    assert.equal(job.isPermanentlyFailed, false);

    // Confirm that the same record was returned.
    const resultKey =
      jobType === JOB_TYPES.NOTIFICATION
        ? "notificationId"
        : "activityId";

    assert.equal(
      job.result[resultKey],
      firstResult[resultKey]
    );

    // Confirm that only one database record exists.
    const count = await Model.countDocuments({
      backgroundJobId: job.id,
    });

    assert.equal(count, 1);

    const stats = worker.getStats();

    assert.equal(stats.completed, 1);
    assert.equal(stats.failed, 0);
    assert.equal(stats.recovered, 1);
    assert.equal(stats.totalAttempts, 2);

    console.log("Job type:", jobType);
    console.log("Attempts:", job.attempts);
    console.log("Retries:", job.retryCount);
    console.log("Database records:", count);
    console.log("Final status:", job.status);

    console.log(
      `[PASS] ${jobType} recovered without duplicates`
    );

  } finally {

    await worker.stop();
  }
}

// ==========================================
// TEST 1 - NOTIFICATION RETRY
// ==========================================

async function testNotificationRetry() {

  console.log(
    "\n===== TEST 1: NOTIFICATION DATABASE RETRY ====="
  );

  await testDatabaseRetry(

    JOB_TYPES.NOTIFICATION,

    {
      user: String(testUserId),
      task: String(testTaskId),
      type: "taskAssigned",
      message: "Milestone 9 database retry test",
    },

    Notification
  );
}

// ==========================================
// TEST 2 - ACTIVITY LOG RETRY
// ==========================================

async function testActivityRetry() {

  console.log(
    "\n===== TEST 2: ACTIVITY DATABASE RETRY ====="
  );

  await testDatabaseRetry(

    JOB_TYPES.ACTIVITY_LOG,

    {
      task: String(testTaskId),
      performedBy: String(testUserId),
      eventType: "taskCreated",

      details: {
        test: "Milestone 9 database retry",
      },
    },

    TaskActivity
  );
}

// ==========================================
// CLEANUP TEST DATA ONLY
// ==========================================

async function cleanup() {

  const filter = {
    backgroundJobId: {
      $in: testJobIds,
    },
  };

  const results = await Promise.all([
    Notification.deleteMany(filter),
    TaskActivity.deleteMany(filter),
  ]);

  console.log(
    "Test notifications removed:",
    results[0].deletedCount
  );

  console.log(
    "Test activity logs removed:",
    results[1].deletedCount
  );
}

// ==========================================
// RUN ALL TESTS
// ==========================================

async function runTests() {

  console.log(
    "\nMILESTONE 9 - DATABASE RETRY INTEGRATION"
  );

  const uri = process.env.MONGO_URI;

  if (
    !uri ||
    !/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(uri)
  ) {
    throw new Error(
      "Tests require a local MongoDB URI"
    );
  }

  try {

    await mongoose.connect(uri);

    if (
      !/^task_hardening_test_[a-f0-9]{32}$/.test(mongoose.connection.name)
    ) {
      throw new Error("Unexpected test database");
    }

    console.log("MongoDB connected");

    await Promise.all([
      Notification.init(),
      TaskActivity.init(),
    ]);

    await Promise.all([
      Notification.createIndexes(),
      TaskActivity.createIndexes(),
    ]);

    console.log("Database indexes initialized");

    await testNotificationRetry();

    await testActivityRetry();

    console.log("\n====================================");

    console.log(
      "ALL 2 DATABASE RETRY TESTS PASSED"
    );

    console.log("====================================");

  } finally {

    try {

      if (
        mongoose.connection.readyState === 1 &&
        /^task_hardening_test_[a-f0-9]{32}$/.test(mongoose.connection.name) &&
        testJobIds.length > 0
      ) {

        await cleanup();
      }

    } finally {

      await mongoose.disconnect();

      console.log("MongoDB disconnected");
    }
  }
}

runTests().catch(error => {

  console.error("TEST FAILED:", error);

  process.exitCode = 1;
});
