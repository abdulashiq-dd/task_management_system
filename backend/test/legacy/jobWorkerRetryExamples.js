
const assert = require("node:assert/strict");

const {
  JobQueue,
  JOB_TYPES,
  JOB_STATUS
} = require("../../src/queues/jobQueue");

const {
  JobWorker
} = require("../../src/workers/jobWorker");

const {
  RetryableError,
  NonRetryableError,
  isRetryableError
} = require("../../src/utils/jobErrors");

const {
  sleep
} = require("../../src/utils/retry");

// ==========================================
// TEST HELPERS
// ==========================================

function createQueue(retryDelay = 50) {

  return new JobQueue({
    maxRetries: 3,
    retryDelay
  });
}

function enqueueJob(queue, name) {

  return queue.enqueue(

    JOB_TYPES.REPORT_GENERATION,

    {
      reportType: "taskSummary",
      name
    },

    "test-user"
  );
}

async function waitFor(
  condition,
  timeout = 5000
) {

  const startTime = Date.now();

  while (!condition()) {

    if (Date.now() - startTime >= timeout) {

      throw new Error(
        "Test condition timed out"
      );
    }

    await sleep(10);
  }
}

// ==========================================
// TEST 1 - ERROR CLASSIFICATION
// ==========================================

function testErrorClassification() {

  console.log("\n===== TEST 1: ERROR CLASSIFICATION =====");

  assert.equal(
    isRetryableError(
      new RetryableError("Temporary failure")
    ),
    true
  );

  assert.equal(
    isRetryableError(
      new NonRetryableError("Invalid payload")
    ),
    false
  );

  const networkError = new Error(
    "Connection reset"
  );

  networkError.code = "ECONNRESET";

  assert.equal(
    isRetryableError(networkError),
    true
  );

  assert.equal(
    isRetryableError(new TypeError("Invalid type")),
    false
  );

  assert.equal(
    isRetryableError(new Error("Unknown error")),
    false
  );

  const duplicateError = new Error(
    "Duplicate key"
  );

  duplicateError.code = 11000;

  assert.equal(
    isRetryableError(duplicateError),
    false
  );

  console.log("[PASS] Error classification");
}

// ==========================================
// TEST 2 - TEMPORARY FAILURE RECOVERY
// ==========================================

async function testTemporaryFailure() {

  console.log("\n===== TEST 2: TEMPORARY FAILURE =====");

  const queue = createQueue();

  const job = enqueueJob(queue, "Temporary");

  const worker = new JobWorker({

    queue,

    concurrency: 2,

    pollIntervalMs: 10,

    handler: async (job) => {

      if (job.attempts < 3) {

        throw new RetryableError(
          `Temporary failure ${job.attempts}`
        );
      }

      return {
        message: "Recovered successfully"
      };
    }
  });

  try {

    worker.start();

    await waitFor(
      () => job.status === JOB_STATUS.COMPLETED
    );

    const stats = worker.getStats();

    assert.equal(job.attempts, 3);
    assert.equal(job.retryCount, 2);
    assert.equal(job.errorHistory.length, 2);

    assert.equal(stats.totalProcessed, 1);
    assert.equal(stats.completed, 1);
    assert.equal(stats.failed, 0);
    assert.equal(stats.totalAttempts, 3);
    assert.equal(stats.failedAttempts, 2);
    assert.equal(stats.retriesScheduled, 2);
    assert.equal(stats.retryAttempts, 2);
    assert.equal(stats.recovered, 1);

    console.log("Worker statistics:", stats);

    console.log("[PASS] Temporary failure recovered");

  } finally {

    await worker.stop();
  }
}

// ==========================================
// TEST 3 - PERMANENT FAILURE
// ==========================================

async function testPermanentFailure() {

  console.log("\n===== TEST 3: PERMANENT FAILURE =====");

  const queue = createQueue();

  const job = enqueueJob(queue, "Always fails");

  const worker = new JobWorker({

    queue,

    concurrency: 2,

    pollIntervalMs: 10,

    handler: async () => {

      throw new RetryableError(
        "Database remains unavailable"
      );
    }
  });

  try {

    worker.start();

    await waitFor(
      () => job.status === JOB_STATUS.FAILED
    );

    const stats = worker.getStats();

    assert.equal(job.attempts, 4);
    assert.equal(job.retryCount, 3);
    assert.equal(job.errorHistory.length, 4);
    assert.equal(job.isPermanentlyFailed, true);

    assert.equal(stats.totalProcessed, 1);
    assert.equal(stats.completed, 0);
    assert.equal(stats.failed, 1);
    assert.equal(stats.totalAttempts, 4);
    assert.equal(stats.failedAttempts, 4);
    assert.equal(stats.retriesScheduled, 3);
    assert.equal(stats.permanentlyFailed, 1);

    console.log("Worker statistics:", stats);

    console.log("[PASS] Permanent failure after 3 retries");

  } finally {

    await worker.stop();
  }
}

// ==========================================
// TEST 4 - NON-RETRYABLE ERROR
// ==========================================

async function testNonRetryableFailure() {

  console.log("\n===== TEST 4: NON-RETRYABLE ERROR =====");

  const queue = createQueue();

  const job = enqueueJob(queue, "Invalid operation");

  const worker = new JobWorker({

    queue,

    concurrency: 1,

    pollIntervalMs: 10,

    handler: async () => {

      throw new NonRetryableError(
        "Invalid job payload"
      );
    }
  });

  try {

    worker.start();

    await waitFor(
      () => job.status === JOB_STATUS.FAILED
    );

    assert.equal(job.attempts, 1);
    assert.equal(job.retryCount, 0);
    assert.equal(job.isPermanentlyFailed, true);

    assert.equal(
      worker.getStats().retriesScheduled,
      0
    );

    console.log("[PASS] Non-retryable job failed immediately");

  } finally {

    await worker.stop();
  }
}

// ==========================================
// TEST 5 - RETRY DOES NOT BLOCK WORKER
// ==========================================

async function testWorkerSlotRelease() {

  console.log("\n===== TEST 5: WORKER SLOT RELEASE =====");

  const queue = createQueue(500);

  const jobA = enqueueJob(queue, "Job A");

  const jobB = enqueueJob(queue, "Job B");

  const executionOrder = [];

  const worker = new JobWorker({

    queue,

    concurrency: 1,

    pollIntervalMs: 10,

    handler: async (job) => {

      executionOrder.push(
        `${job.payload.name} - Attempt ${job.attempts}`
      );

      if (
        job.id === jobA.id &&
        job.attempts === 1
      ) {

        throw new RetryableError(
          "Temporary failure A"
        );
      }

      return {
        success: true
      };
    }
  });

  try {

    worker.start();

    await waitFor(
      () => jobB.status === JOB_STATUS.COMPLETED
    );

    assert.equal(
      jobA.status,
      JOB_STATUS.RETRYING
    );

    await waitFor(
      () => jobA.status === JOB_STATUS.COMPLETED
    );

    assert.deepEqual(executionOrder, [

      "Job A - Attempt 1",

      "Job B - Attempt 1",

      "Job A - Attempt 2"
    ]);

    assert.equal(
      worker.getStats().maxConcurrentJobs,
      1
    );

    console.log(
      "Execution order:",
      executionOrder
    );

    console.log("[PASS] Retry delay does not occupy worker slot");

  } finally {

    await worker.stop();
  }
}

// ==========================================
// TEST 6 - CONTROLLED CONCURRENCY
// ==========================================

async function testControlledConcurrency() {

  console.log("\n===== TEST 6: CONTROLLED CONCURRENCY =====");

  const queue = createQueue();

  const jobs = [

    enqueueJob(queue, "Job 1"),

    enqueueJob(queue, "Job 2"),

    enqueueJob(queue, "Job 3"),

    enqueueJob(queue, "Job 4")
  ];

  const worker = new JobWorker({

    queue,

    concurrency: 2,

    pollIntervalMs: 10,

    handler: async (job) => {

      await sleep(50);

      if (
        job.id === jobs[0].id &&
        job.attempts === 1
      ) {

        throw new RetryableError(
          "Temporary failure"
        );
      }

      if (job.id === jobs[1].id) {

        throw new NonRetryableError(
          "Permanent failure"
        );
      }

      return {
        success: true
      };
    }
  });

  try {

    worker.start();

    await waitFor(() =>

      jobs.every(job =>

        job.status === JOB_STATUS.COMPLETED ||

        job.status === JOB_STATUS.FAILED
      )
    );

    const stats = worker.getStats();

    assert.equal(stats.completed, 3);
    assert.equal(stats.failed, 1);
    assert.equal(stats.recovered, 1);
    assert.equal(stats.totalProcessed, 4);
    assert.equal(stats.totalAttempts, 5);
    assert.equal(stats.maxConcurrentJobs, 2);

    console.log("Final statistics:", stats);

    console.log("[PASS] Controlled concurrency and failure isolation");

  } finally {

    await worker.stop();
  }
}

// ==========================================
// TEST 7 - GRACEFUL SHUTDOWN DURING RETRY
// ==========================================
async function testUnsafeWriteProtection() {

  console.log(
    "\n===== TEST 8: DATABASE JOB RETRIES ====="
  );

  const queue = createQueue();

  const jobs = [

    queue.enqueue(
      JOB_TYPES.NOTIFICATION,
      {
        message: "Test notification"
      },
      "test-user"
    ),

    queue.enqueue(
      JOB_TYPES.ACTIVITY_LOG,
      {
        eventType: "taskCreated"
      },
      "test-user"
    )
  ];

  const worker = new JobWorker({

    queue,

    concurrency: 2,

    pollIntervalMs: 10,

    handler: async (job) => {

      if (job.attempts === 1) {

        throw new RetryableError(
          "Temporary database connection failure"
        );
      }

      return {
        success: true
      };
    }
  });

  try {

    worker.start();

    await waitFor(() =>
      jobs.every(job =>
        job.status === JOB_STATUS.COMPLETED
      )
    );

    for (const job of jobs) {

      assert.equal(job.attempts, 2);

      assert.equal(job.retryCount, 1);

      assert.equal(job.errorHistory.length, 1);

      assert.equal(
        job.isPermanentlyFailed,
        false
      );
    }

    const stats = worker.getStats();

    assert.equal(stats.completed, 2);
    assert.equal(stats.failed, 0);
    assert.equal(stats.totalAttempts, 4);
    assert.equal(stats.recovered, 2);
    assert.equal(stats.retriesScheduled, 2);

    console.log("Worker statistics:", stats);

    console.log(
      "[PASS] Notification and activity jobs recovered after retry"
    );

  } finally {

    await worker.stop();
  }
}

// ==========================================
// TEST 8 - UNSAFE WRITE RETRY PROTECTION
// ==========================================

// ==========================================
// TEST 7 - GRACEFUL SHUTDOWN DURING RETRY
// ==========================================

async function testShutdownDuringRetry() {

  console.log(
    "\n===== TEST 7: SHUTDOWN DURING RETRY ====="
  );

  const queue = createQueue(500);

  const job = enqueueJob(
    queue,
    "Delayed retry"
  );

  const worker = new JobWorker({

    queue,

    concurrency: 1,

    pollIntervalMs: 10,

    handler: async () => {

      throw new RetryableError(
        "Temporary failure"
      );
    }
  });

  try {

    worker.start();

    await waitFor(
      () => job.status === JOB_STATUS.RETRYING
    );

    await worker.stop();

    assert.equal(worker.isRunning, false);

    assert.equal(worker.activeJobs, 0);

    assert.equal(worker.inFlightJobs.size, 0);

    // Wait beyond the scheduled retry time.

    await sleep(550);

    // Verify that the stopped worker
    // does not execute another attempt.

    assert.equal(job.attempts, 1);

    console.log(
      "[PASS] Worker stops scheduled retry execution"
    );

  } finally {

    await worker.stop();
  }
}

// ==========================================
// RUN ALL TESTS
// ==========================================

async function runTests() {

  console.log(
    "\nMILESTONE 9 - WORKER RETRY TESTING"
  );

  testErrorClassification();

  await testTemporaryFailure();

  await testPermanentFailure();

  await testNonRetryableFailure();

  await testWorkerSlotRelease();

  await testControlledConcurrency();

  await testShutdownDuringRetry();

  await testUnsafeWriteProtection();

  console.log("\n====================================");

  console.log("ALL 8 WORKER RETRY TESTS PASSED");

  console.log("====================================");
}

runTests().catch(error => {

  console.error("TEST FAILED:", error);

  process.exitCode = 1;
});
