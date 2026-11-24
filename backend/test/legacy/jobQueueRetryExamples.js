
const assert = require("node:assert/strict");

const {
  JobQueue,
  JOB_TYPES,
  JOB_STATUS,
} = require("../../src/queues/jobQueue");

const { sleep } = require("../../src/utils/retry");

// ==========================================
// CREATE ISOLATED TEST QUEUE
// ==========================================

function createTestQueue() {
  return new JobQueue({
    maxRetries: 3,
    retryDelay: 100,
  });
}

function createJob(queue) {
  return queue.enqueue(
    JOB_TYPES.REPORT_GENERATION,
    {
      reportType: "taskSummary",
    },
    "test-user"
  );
}

// ==========================================
// TEST 1 - INITIAL JOB METADATA
// ==========================================

function testInitialMetadata() {

  console.log("\n===== TEST 1: INITIAL METADATA =====");

  const queue = createTestQueue();

  const job = createJob(queue);

  assert.equal(job.status, JOB_STATUS.PENDING);
  assert.equal(job.attempts, 0);
  assert.equal(job.retryCount, 0);
  assert.equal(job.maxRetries, 3);
  assert.equal(job.nextRetryAt, null);
  assert.equal(job.lastError, null);
  assert.deepEqual(job.errorHistory, []);
  assert.equal(job.isPermanentlyFailed, false);

  console.log("[PASS] Initial retry metadata");
}

// ==========================================
// TEST 2 - RETRY SCHEDULING
// ==========================================

async function testRetryScheduling() {

  console.log("\n===== TEST 2: RETRY SCHEDULING =====");

  const queue = createTestQueue();

  const job = createJob(queue);

  queue.dequeue();

  assert.equal(job.attempts, 1);

  queue.markFailed(
    job.id,
    new Error("Temporary failure")
  );

  assert.equal(job.status, JOB_STATUS.RETRYING);
  assert.equal(job.retryCount, 1);
  assert.equal(queue.getDelayedCount(), 1);
  assert.equal(job.errorHistory.length, 1);

  assert.equal(
    job.lastError,
    "Temporary failure"
  );

  // Retry must not be available immediately.
  assert.equal(queue.dequeue(), null);

  await sleep(
    Math.max(
      0,
      job.nextRetryAt.getTime() - Date.now()
    ) + 20
  );

  const retriedJob = queue.dequeue();

  assert.equal(retriedJob.id, job.id);
  assert.equal(retriedJob.attempts, 2);
  assert.equal(
    retriedJob.status,
    JOB_STATUS.PROCESSING
  );

  assert.equal(queue.getDelayedCount(), 0);

  console.log("[PASS] Delayed retry scheduling");
}

// ==========================================
// TEST 3 - SUCCESS AFTER RETRY
// ==========================================

async function testSuccessAfterRetry() {

  console.log("\n===== TEST 3: RETRY RECOVERY =====");

  const queue = createTestQueue();

  const job = createJob(queue);

  queue.dequeue();

  queue.markFailed(
    job.id,
    new Error("Temporary database error")
  );

  await sleep(
    Math.max(
      0,
      job.nextRetryAt.getTime() - Date.now()
    ) + 20
  );

  queue.dequeue();

  queue.markCompleted(job.id, {
    message: "Recovered successfully",
  });

  assert.equal(job.status, JOB_STATUS.COMPLETED);
  assert.equal(job.attempts, 2);
  assert.equal(job.retryCount, 1);
  assert.equal(job.error, null);
  assert.equal(job.nextRetryAt, null);
  assert.equal(job.errorHistory.length, 1);
  assert.equal(job.isPermanentlyFailed, false);

  assert.equal(
    job.result.message,
    "Recovered successfully"
  );

  console.log("[PASS] Successful recovery after retry");
}

// ==========================================
// TEST 4 - PERMANENT FAILURE
// ==========================================

async function testPermanentFailure() {

  console.log("\n===== TEST 4: PERMANENT FAILURE =====");

  const queue = createTestQueue();

  const job = createJob(queue);

  const observedDelays = [];

  for (let attempt = 1; attempt <= 4; attempt++) {

    const currentJob = queue.dequeue();

    assert.ok(currentJob);

    assert.equal(currentJob.id, job.id);

    assert.equal(currentJob.attempts, attempt);

    const beforeFailure = Date.now();

    queue.markFailed(
      job.id,
      new Error(`Failure ${attempt}`)
    );

    if (attempt < 4) {

      assert.equal(
        job.status,
        JOB_STATUS.RETRYING
      );

      const expectedDelay =
        100 * 2 ** (attempt - 1);

      const actualDelay =
        job.nextRetryAt.getTime() -
        beforeFailure;

      assert.ok(
        actualDelay >= expectedDelay
      );

      observedDelays.push(expectedDelay);

      await sleep(
        Math.max(
          0,
          job.nextRetryAt.getTime() - Date.now()
        ) + 20
      );
    }
  }

  assert.equal(job.status, JOB_STATUS.FAILED);
  assert.equal(job.attempts, 4);
  assert.equal(job.retryCount, 3);
  assert.equal(job.errorHistory.length, 4);
  assert.equal(job.isPermanentlyFailed, true);
  assert.equal(job.nextRetryAt, null);

  assert.ok(job.failedAt instanceof Date);

  assert.equal(queue.getDelayedCount(), 0);
  assert.equal(queue.dequeue(), null);

  assert.deepEqual(observedDelays, [
    100,
    200,
    400,
  ]);

  console.log("Retry delays:", observedDelays);

  console.log("[PASS] Permanent failure after 3 retries");
}

// ==========================================
// TEST 5 - NON-RETRYABLE FAILURE
// ==========================================

function testNonRetryableFailure() {

  console.log("\n===== TEST 5: NON-RETRYABLE ERROR =====");

  const queue = createTestQueue();

  const job = createJob(queue);

  queue.dequeue();

  queue.markFailed(
    job.id,
    new Error("Invalid job payload"),
    {
      retryable: false,
    }
  );

  assert.equal(job.status, JOB_STATUS.FAILED);
  assert.equal(job.attempts, 1);
  assert.equal(job.retryCount, 0);
  assert.equal(job.isPermanentlyFailed, true);
  assert.equal(queue.getDelayedCount(), 0);

  assert.equal(
    job.errorHistory[0].retryable,
    false
  );

  console.log("[PASS] Non-retryable failure");
}

// ==========================================
// TEST 6 - OTHER JOBS CONTINUE
// ==========================================

async function testOtherJobsContinue() {

  console.log("\n===== TEST 6: OTHER JOBS CONTINUE =====");

  const queue = createTestQueue();

  const jobA = createJob(queue);
  const jobB = createJob(queue);

  const firstJob = queue.dequeue();

  assert.equal(firstJob.id, jobA.id);

  queue.markFailed(
    jobA.id,
    new Error("Temporary failure")
  );

  // Job B can execute while Job A is delayed.
  const secondJob = queue.dequeue();

  assert.equal(secondJob.id, jobB.id);

  queue.markCompleted(jobB.id, {
    success: true,
  });

  assert.equal(jobB.status, JOB_STATUS.COMPLETED);

  await sleep(
    Math.max(
      0,
      jobA.nextRetryAt.getTime() - Date.now()
    ) + 20
  );

  const retriedJob = queue.dequeue();

  assert.equal(retriedJob.id, jobA.id);

  queue.markCompleted(jobA.id);

  assert.equal(jobA.status, JOB_STATUS.COMPLETED);

  console.log("[PASS] Delayed job does not block other jobs");
}

// ==========================================
// TEST 7 - QUEUE STATISTICS
// ==========================================

function testQueueStatistics() {

  console.log("\n===== TEST 7: QUEUE STATISTICS =====");

  const queue = createTestQueue();

  const jobA = createJob(queue);
  const jobB = createJob(queue);
  const jobC = createJob(queue);

  queue.dequeue();

  queue.markFailed(
    jobA.id,
    new Error("Temporary failure")
  );

  queue.dequeue();

  queue.markCompleted(jobB.id);

  // Job C remains pending.
  const stats = queue.getStats();

  assert.deepEqual(stats, {
    total: 3,
    pending: 1,
    processing: 0,
    retrying: 1,
    completed: 1,
    failed: 0,
  });

  console.log("Queue statistics:", stats);

  console.log("[PASS] Retry statistics");
}

// ==========================================
// TEST 8 - MEMORY PROTECTION
// ==========================================

function testMemoryProtection() {

  console.log("\n===== TEST 8: MEMORY PROTECTION =====");

  const queue = createTestQueue();

  queue.maxActiveJobs = 1;

  const job = createJob(queue);

  queue.dequeue();

  queue.markFailed(
    job.id,
    new Error("Temporary failure")
  );

  assert.equal(job.status, JOB_STATUS.RETRYING);

  assert.throws(
    () => createJob(queue),
    /Job queue is full/
  );

  assert.equal(queue.getStats().total, 1);

  console.log("[PASS] Retry jobs included in memory limits");
}

// ==========================================
// RUN ALL TESTS
// ==========================================

async function runTests() {

  console.log(
    "\nMILESTONE 9 - JOB QUEUE RETRY TESTING"
  );

  testInitialMetadata();

  await testRetryScheduling();

  await testSuccessAfterRetry();

  await testPermanentFailure();

  testNonRetryableFailure();

  await testOtherJobsContinue();

  testQueueStatistics();

  testMemoryProtection();

  console.log("\n====================================");

  console.log("ALL 8 JOB QUEUE RETRY TESTS PASSED");

  console.log("====================================");
}

runTests().catch((error) => {

  console.error("TEST FAILED:", error);

  process.exitCode = 1;
});
