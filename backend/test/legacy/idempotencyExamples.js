
require("dotenv").config();
if (!/\/task_hardening_test_[a-f0-9]{32}(?:\?|$)/.test(process.env.MONGO_URI || "")) throw new Error("Run database tests through npm test; an isolated database is required.");

const assert = require("node:assert/strict");

const mongoose = require("mongoose");

const { randomUUID } = require("node:crypto");

const Notification = require(
  "../../src/models/notificationModel"
);

const TaskActivity = require(
  "../../src/models/taskActivityModel"
);

const {
  executeJob,
} = require("../../src/workers/jobHandlers");

const {
  JOB_TYPES,
} = require("../../src/queues/jobQueue");

// ==========================================
// ISOLATED TEST CONFIGURATION
// ==========================================

const testUserId = new mongoose.Types.ObjectId();

const testTaskId = new mongoose.Types.ObjectId();

const testJobIds = [];

// ==========================================
// CREATE TEST JOBS
// ==========================================

function createNotificationJob() {

  const id = randomUUID();

  testJobIds.push(id);

  return {
    id,

    type: JOB_TYPES.NOTIFICATION,

    payload: {
      user: String(testUserId),
      task: String(testTaskId),
      type: "taskAssigned",
      message: "Milestone 9 Idempotency Test",
    },
  };
}

function createActivityJob() {

  const id = randomUUID();

  testJobIds.push(id);

  return {
    id,

    type: JOB_TYPES.ACTIVITY_LOG,

    payload: {
      task: String(testTaskId),
      eventType: "taskCreated",
      performedBy: String(testUserId),

      details: {
        test: "Milestone 9 Idempotency",
      },
    },
  };
}

// ==========================================
// TEST 1 - DATABASE UNIQUE INDEXES
// ==========================================

async function testDatabaseIndexes() {

  console.log("\n===== TEST 1: DATABASE INDEXES =====");

  const notificationIndexes =
    await Notification.collection.indexes();

  const activityIndexes =
    await TaskActivity.collection.indexes();

  function hasUniqueJobIndex(indexes) {

    return indexes.some(index =>

      index.key.backgroundJobId === 1 &&

      index.unique === true &&

      index.partialFilterExpression
        ?.backgroundJobId?.$type === "string"
    );
  }

  assert.ok(
    hasUniqueJobIndex(notificationIndexes)
  );

  assert.ok(
    hasUniqueJobIndex(activityIndexes)
  );

  assert.ok(
    notificationIndexes.some(index =>

      index.key.deduplicationKey === 1 &&

      index.unique === true
    )
  );

  console.log(
    "[PASS] Both unique indexes exist in MongoDB"
  );
}

// ==========================================
// TEST 2 - NOTIFICATION DUPLICATE PREVENTION
// ==========================================

async function testNotificationIdempotency() {

  console.log(
    "\n===== TEST 2: NOTIFICATION IDEMPOTENCY ====="
  );

  const job = createNotificationJob();

  const firstResult = await executeJob(job);

  const secondResult = await executeJob(job);

  const thirdResult = await executeJob(job);

  assert.equal(
    firstResult.notificationId,
    secondResult.notificationId
  );

  assert.equal(
    firstResult.notificationId,
    thirdResult.notificationId
  );

  const count = await Notification.countDocuments({
    backgroundJobId: job.id,
  });

  assert.equal(count, 1);

  console.log("Executions: 3");
  console.log("Database records:", count);

  console.log(
    "[PASS] Duplicate notifications prevented"
  );
}

// ==========================================
// TEST 3 - ACTIVITY LOG DUPLICATE PREVENTION
// ==========================================

async function testActivityIdempotency() {

  console.log(
    "\n===== TEST 3: ACTIVITY LOG IDEMPOTENCY ====="
  );

  const job = createActivityJob();

  const firstResult = await executeJob(job);

  const secondResult = await executeJob(job);

  const thirdResult = await executeJob(job);

  assert.equal(
    firstResult.activityId,
    secondResult.activityId
  );

  assert.equal(
    firstResult.activityId,
    thirdResult.activityId
  );

  const count = await TaskActivity.countDocuments({
    backgroundJobId: job.id,
  });

  assert.equal(count, 1);

  console.log("Executions: 3");

  console.log("Database records:", count);

  console.log(
    "[PASS] Duplicate activity logs prevented"
  );
}

// ==========================================
// TEST 4 - CONCURRENT NOTIFICATION WRITES
// ==========================================

async function testConcurrentNotifications() {

  console.log(
    "\n===== TEST 4: CONCURRENT NOTIFICATIONS ====="
  );

  const job = createNotificationJob();

  const results = await Promise.all([

    executeJob(job),

    executeJob(job),

    executeJob(job),
  ]);

  const ids = results.map(
    result => result.notificationId
  );

  assert.equal(new Set(ids).size, 1);

  const count = await Notification.countDocuments({
    backgroundJobId: job.id,
  });

  assert.equal(count, 1);

  console.log("Concurrent executions: 3");

  console.log("Database records:", count);

  console.log(
    "[PASS] Concurrent notification duplicates prevented"
  );
}

// ==========================================
// TEST 5 - CONCURRENT ACTIVITY WRITES
// ==========================================

async function testConcurrentActivities() {

  console.log(
    "\n===== TEST 5: CONCURRENT ACTIVITY LOGS ====="
  );

  const job = createActivityJob();

  const results = await Promise.all([

    executeJob(job),

    executeJob(job),

    executeJob(job),
  ]);

  const ids = results.map(
    result => result.activityId
  );

  assert.equal(new Set(ids).size, 1);

  const count = await TaskActivity.countDocuments({
    backgroundJobId: job.id,
  });

  assert.equal(count, 1);

  console.log("Concurrent executions: 3");

  console.log("Database records:", count);

  console.log(
    "[PASS] Concurrent activity duplicates prevented"
  );
}

// ==========================================
// TEST 6 - PRESERVE NOTIFICATION READ STATE
// ==========================================

async function testReadStatePreservation() {

  console.log(
    "\n===== TEST 6: READ STATE PRESERVATION ====="
  );

  const job = createNotificationJob();

  const firstResult = await executeJob(job);

  await Notification.updateOne(
    {
      _id: firstResult.notificationId,
    },
    {
      $set: {
        isRead: true,
      },
    }
  );

  const secondResult = await executeJob(job);

  const notification =
    await Notification.findById(
      secondResult.notificationId
    );

  assert.equal(
    firstResult.notificationId,
    secondResult.notificationId
  );

  assert.equal(notification.isRead, true);

  console.log(
    "Notification isRead:",
    notification.isRead
  );

  console.log(
    "[PASS] Retry preserves notification read state"
  );
}

// ==========================================
// TEST 7 - DIFFERENT JOBS REMAIN INDEPENDENT
// ==========================================

async function testIndependentJobs() {

  console.log(
    "\n===== TEST 7: INDEPENDENT JOBS ====="
  );

  const firstJob = createNotificationJob();

  const secondJob = createNotificationJob();

  const firstResult = await executeJob(firstJob);

  const secondResult = await executeJob(secondJob);

  assert.notEqual(
    firstResult.notificationId,
    secondResult.notificationId
  );

  const count = await Notification.countDocuments({

    backgroundJobId: {
      $in: [
        firstJob.id,
        secondJob.id,
      ],
    },
  });

  assert.equal(count, 2);

  console.log("Different job IDs: 2");

  console.log("Database records:", count);

  console.log(
    "[PASS] Different jobs remain independent"
  );
}

// ==========================================
// CLEANUP TEST RECORDS ONLY
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
    "\nTest notifications removed:",
    results[0].deletedCount
  );

  console.log(
    "Test activity logs removed:",
    results[1].deletedCount
  );

  console.log(
    "[Cleanup] Test records removed successfully"
  );
}

// ==========================================
// RUN ALL INTEGRATION TESTS
// ==========================================

async function runTests() {

  console.log(
    "\nMILESTONE 9 - MONGODB IDEMPOTENCY TESTING"
  );

  if (!process.env.MONGO_URI) {

    throw new Error(
      "MONGO_URI is missing from .env"
    );
  }

  const uri = process.env.MONGO_URI;

  // Restrict tests to the local MongoDB instance.
  if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(uri)) {

    throw new Error(
      "Integration tests require a local MongoDB URI"
    );
  }

  try {

    await mongoose.connect(uri);

    console.log("MongoDB connected");

    if (!/^task_hardening_test_[a-f0-9]{32}$/.test(mongoose.connection.name)) {

      throw new Error(
        "Unexpected test database"
      );
    }

    await Promise.all([

      Notification.init(),

      TaskActivity.init(),
    ]);

    await Promise.all([

      Notification.createIndexes(),

      TaskActivity.createIndexes(),
    ]);

    console.log(
      "Database indexes initialized"
    );

    await testDatabaseIndexes();

    await testNotificationIdempotency();

    await testActivityIdempotency();

    await testConcurrentNotifications();

    await testConcurrentActivities();

    await testReadStatePreservation();

    await testIndependentJobs();

    console.log("\n====================================");

    console.log(
      "ALL 7 IDEMPOTENCY TESTS PASSED"
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
