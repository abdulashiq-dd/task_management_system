
const assert = require("node:assert/strict");

const mongoose = require("mongoose");

const {
  jobQueue,
  JOB_TYPES,
  JOB_STATUS,
} = require("../queues/jobQueue");

const {
  getJobs,
  getJobById,
  getJobStats,
} = require("../services/jobService");

const {
  RetryableError,
  NonRetryableError,
} = require("../utils/jobErrors");

// ==========================================
// TEST USERS
// ==========================================

const userA = {
  id: String(new mongoose.Types.ObjectId()),
  role: "user",
};

const userB = {
  id: String(new mongoose.Types.ObjectId()),
  role: "user",
};

const admin = {
  id: String(new mongoose.Types.ObjectId()),
  role: "admin",
};

// ==========================================
// TEST JOB REFERENCES
// ==========================================

let pendingJob;
let retryingJob;
let completedJob;
let failedJob;
let otherUserJob;

// ==========================================
// CREATE TEST DATA
// ==========================================

function setupTestJobs() {

  // Job that will wait for a retry.

  retryingJob = jobQueue.enqueue(

    JOB_TYPES.REPORT_GENERATION,

    {
      reportType: "taskSummary",
    },

    userA.id
  );

  jobQueue.dequeue();

  jobQueue.markFailed(

    retryingJob.id,

    new RetryableError(
      "Internal MongoDB connection failure"
    ),

    {
      retryable: true,
    }
  );

  // Job that recovered after a retry.

  completedJob = jobQueue.enqueue(

    JOB_TYPES.NOTIFICATION,

    {
      message: "Recovered notification",
    },

    userA.id
  );

  jobQueue.dequeue();

  jobQueue.markFailed(

    completedJob.id,

    new RetryableError(
      "Temporary database failure"
    ),

    {
      retryable: true,
    }
  );

  // Promote only this job's retry without
  // waiting for the actual timer.

  jobQueue.delayedJobs.set(
    completedJob.id,
    Date.now() - 1
  );

  jobQueue.promoteDelayedJobs();

  const retryJob = jobQueue.dequeue();

  assert.equal(
    retryJob.id,
    completedJob.id
  );

  jobQueue.markCompleted(

    completedJob.id,

    {
      success: true,
      message: "Recovered successfully",
    }
  );

  // Permanently failed job.

  failedJob = jobQueue.enqueue(

    JOB_TYPES.ACTIVITY_LOG,

    {
      eventType: "taskCreated",
    },

    userA.id
  );

  jobQueue.dequeue();

  jobQueue.markFailed(

    failedJob.id,

    new NonRetryableError(
      "Sensitive internal database error"
    ),

    {
      retryable: false,
    }
  );

  // Pending job owned by User A.

  pendingJob = jobQueue.enqueue(

    JOB_TYPES.REPORT_GENERATION,

    {
      reportType: "taskSummary",
    },

    userA.id
  );

  // Pending job owned by User B.

  otherUserJob = jobQueue.enqueue(

    JOB_TYPES.REPORT_GENERATION,

    {
      reportType: "taskSummary",
    },

    userB.id
  );

  console.log("[Setup] Five test jobs created");
}

// ==========================================
// TEST 1 - USER JOB LISTING
// ==========================================

function testUserJobListing() {

  console.log(
    "\n===== TEST 1: USER JOB LISTING ====="
  );

  const jobs = getJobs(userA);

  assert.equal(jobs.length, 4);

  assert.ok(

    jobs.every(
      job => job.userId === userA.id
    )
  );

  assert.ok(

    !jobs.some(
      job => job.id === otherUserJob.id
    )
  );

  console.log("Accessible jobs:", jobs.length);

  console.log(
    "[PASS] Users can access only their own jobs"
  );
}

// ==========================================
// TEST 2 - ADMIN JOB LISTING
// ==========================================

function testAdminJobListing() {

  console.log(
    "\n===== TEST 2: ADMIN JOB LISTING ====="
  );

  const jobs = getJobs(admin);

  assert.equal(jobs.length, 5);

  console.log("Accessible jobs:", jobs.length);

  console.log(
    "[PASS] Admin can access all jobs"
  );
}

// ==========================================
// TEST 3 - RETRY METADATA
// ==========================================

function testRetryMetadata() {

  console.log(
    "\n===== TEST 3: RETRY METADATA ====="
  );

  const job = getJobById(
    retryingJob.id,
    userA
  );

  assert.equal(
    job.status,
    JOB_STATUS.RETRYING
  );

  assert.equal(job.attempts, 1);

  assert.equal(job.maxAttempts, 4);

  assert.equal(job.retryCount, 1);

  assert.equal(job.maxRetries, 3);

  assert.ok(
    job.nextRetryAt instanceof Date
  );

  assert.equal(
    job.isPermanentlyFailed,
    false
  );

  assert.equal(job.errorHistory.length, 1);

  assert.equal(
    job.errorHistory[0].retryable,
    true
  );

  console.log(
    JSON.stringify(job, null, 2)
  );

  console.log(
    "[PASS] Retry metadata returned correctly"
  );
}

// ==========================================
// TEST 4 - STATUS FILTERING
// ==========================================

function testStatusFiltering() {

  console.log(
    "\n===== TEST 4: STATUS FILTERING ====="
  );

  const retrying = getJobs(userA, {

    status: JOB_STATUS.RETRYING,
  });

  const completed = getJobs(userA, {

    status: JOB_STATUS.COMPLETED,
  });

  const failed = getJobs(userA, {

    status: JOB_STATUS.FAILED,
  });

  const pending = getJobs(userA, {

    status: JOB_STATUS.PENDING,
  });

  assert.equal(retrying.length, 1);

  assert.equal(completed.length, 1);

  assert.equal(failed.length, 1);

  assert.equal(pending.length, 1);

  assert.equal(
    retrying[0].id,
    retryingJob.id
  );

  console.log("Retrying:", retrying.length);

  console.log("Completed:", completed.length);

  console.log("Failed:", failed.length);

  console.log("Pending:", pending.length);

  console.log(
    "[PASS] Job status filtering works"
  );
}

// ==========================================
// TEST 5 - TYPE AND COMBINED FILTERING
// ==========================================

function testTypeFiltering() {

  console.log(
    "\n===== TEST 5: TYPE FILTERING ====="
  );

  const reports = getJobs(userA, {

    type: JOB_TYPES.REPORT_GENERATION,
  });

  assert.equal(reports.length, 2);

  const notifications = getJobs(userA, {

    type: JOB_TYPES.NOTIFICATION,
  });

  assert.equal(notifications.length, 1);

  const combined = getJobs(userA, {

    type: JOB_TYPES.REPORT_GENERATION,

    status: JOB_STATUS.RETRYING,
  });

  assert.equal(combined.length, 1);

  assert.equal(
    combined[0].id,
    retryingJob.id
  );

  console.log(
    "[PASS] Type and combined filtering works"
  );
}

// ==========================================
// TEST 6 - SANITIZED ERROR HISTORY
// ==========================================

function testSanitizedErrors() {

  console.log(
    "\n===== TEST 6: ERROR SANITIZATION ====="
  );

  const job = getJobById(
    failedJob.id,
    userA
  );

  assert.equal(
    job.status,
    JOB_STATUS.FAILED
  );

  assert.equal(
    job.isPermanentlyFailed,
    true
  );

  assert.equal(
    job.error,
    "Job execution failed"
  );

  assert.equal(
    job.lastError,
    "Job attempt failed"
  );

  assert.equal(
    job.errorHistory[0].message,
    "Job attempt failed"
  );

  assert.equal(
    job.errorHistory[0].retryable,
    false
  );

  const serialized = JSON.stringify(job);

  assert.ok(

    !serialized.includes(
      "Sensitive internal database error"
    )
  );

  assert.ok(

    !("stack" in job.errorHistory[0])
  );

  assert.ok(

    !("code" in job.errorHistory[0])
  );

  // Original error is retained internally.

  assert.equal(

    jobQueue.getJob(failedJob.id).lastError,

    "Sensitive internal database error"
  );

  console.log(
    JSON.stringify(job, null, 2)
  );

  console.log(
    "[PASS] Internal error details are not exposed"
  );
}

// ==========================================
// TEST 7 - RECOVERED JOB RESPONSE
// ==========================================

function testRecoveredJob() {

  console.log(
    "\n===== TEST 7: RECOVERED JOB ====="
  );

  const job = getJobById(
    completedJob.id,
    userA
  );

  assert.equal(
    job.status,
    JOB_STATUS.COMPLETED
  );

  assert.equal(job.attempts, 2);

  assert.equal(job.retryCount, 1);

  assert.equal(job.nextRetryAt, null);

  assert.equal(job.error, null);

  assert.equal(job.errorHistory.length, 1);

  assert.equal(
    job.isPermanentlyFailed,
    false
  );

  assert.equal(job.result.success, true);

  console.log(
    "[PASS] Recovered job information preserved"
  );
}

// ==========================================
// TEST 8 - UNAUTHORIZED JOB ACCESS
// ==========================================

function testUnauthorizedAccess() {

  console.log(
    "\n===== TEST 8: UNAUTHORIZED ACCESS ====="
  );

  assert.throws(

    () => getJobById(
      otherUserJob.id,
      userA
    ),

    error => error.statusCode === 404
  );

  assert.throws(

    () => getJobById(
      failedJob.id,
      userB
    ),

    error => error.statusCode === 404
  );

  const adminResult = getJobById(

    otherUserJob.id,

    admin
  );

  assert.equal(
    adminResult.id,
    otherUserJob.id
  );

  console.log(
    "[PASS] Job ownership authorization works"
  );
}

// ==========================================
// TEST 9 - USER RETRY STATISTICS
// ==========================================

function testUserStatistics() {

  console.log(
    "\n===== TEST 9: USER STATISTICS ====="
  );

  const stats = getJobStats(userA);

  assert.equal(stats.queue.total, 4);

  assert.equal(stats.queue.pending, 1);

  assert.equal(stats.queue.processing, 0);

  assert.equal(stats.queue.retrying, 1);

  assert.equal(stats.queue.completed, 1);

  assert.equal(stats.queue.failed, 1);

  assert.equal(
    stats.retries.totalAttempts,
    4
  );

  assert.equal(
    stats.retries.totalRetriesScheduled,
    2
  );

  assert.equal(
    stats.retries.totalRetryAttempts,
    1
  );

  assert.equal(
    stats.retries.failedAttempts,
    3
  );

  assert.equal(
    stats.retries.retriedJobs,
    2
  );

  assert.equal(
    stats.retries.recoveredJobs,
    1
  );

  assert.equal(
    stats.retries.permanentlyFailedJobs,
    1
  );

  assert.equal(
    stats.retries.awaitingRetry,
    1
  );

  assert.ok(!("worker" in stats));

  console.log(
    JSON.stringify(stats, null, 2)
  );

  console.log(
    "[PASS] User-level retry statistics are correct"
  );
}

// ==========================================
// TEST 10 - ADMIN STATISTICS
// ==========================================

function testAdminStatistics() {

  console.log(
    "\n===== TEST 10: ADMIN STATISTICS ====="
  );

  const stats = getJobStats(admin);

  assert.equal(stats.queue.total, 5);

  assert.equal(stats.queue.pending, 2);

  assert.ok(stats.worker);

  assert.equal(
    typeof stats.worker.totalAttempts,
    "number"
  );

  assert.equal(
    typeof stats.worker.recovered,
    "number"
  );

  assert.equal(
    typeof stats.worker.permanentlyFailed,
    "number"
  );

  console.log(
    JSON.stringify(stats, null, 2)
  );

  console.log(
    "[PASS] Admin worker statistics are available"
  );
}

// ==========================================
// TEST 11 - INPUT VALIDATION
// ==========================================

function testInputValidation() {

  console.log(
    "\n===== TEST 11: INPUT VALIDATION ====="
  );

  assert.throws(

    () => getJobs(userA, {

      status: "invalid",
    }),

    error => error.statusCode === 400
  );

  assert.throws(

    () => getJobs(userA, {

      type: "invalid",
    }),

    error => error.statusCode === 400
  );

  assert.throws(

    () => getJobs(null),

    error => error.statusCode === 401
  );

  assert.throws(

    () => getJobs({

      id: "invalid-id",

      role: "user",
    }),

    error => error.statusCode === 400
  );

  assert.throws(

    () => getJobs({

      id: userA.id,

      role: "unknown",
    }),

    error => error.statusCode === 403
  );

  assert.throws(

    () => getJobById(
      "nonexistent-job",
      userA
    ),

    error => error.statusCode === 404
  );

  assert.throws(

    () => getJobById("", userA),

    error => error.statusCode === 400
  );

  console.log(
    "[PASS] Invalid requests handled correctly"
  );
}

// ==========================================
// RUN ALL TESTS
// ==========================================

function runTests() {

  console.log(
    "\nMILESTONE 9 - JOB API SERVICE TESTING"
  );

  setupTestJobs();

  testUserJobListing();

  testAdminJobListing();

  testRetryMetadata();

  testStatusFiltering();

  testTypeFiltering();

  testSanitizedErrors();

  testRecoveredJob();

  testUnauthorizedAccess();

  testUserStatistics();

  testAdminStatistics();

  testInputValidation();

  console.log("\n====================================");

  console.log(
    "ALL 11 JOB API SERVICE TESTS PASSED"
  );

  console.log("====================================");
}

try {

  runTests();

} catch (error) {

  console.error("TEST FAILED:", error);

  process.exitCode = 1;
}
