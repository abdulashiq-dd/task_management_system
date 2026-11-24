
require("dotenv").config();

const mongoose = require("mongoose");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const Task = require("../models/taskModel");

const {
  Export,
  EXPORT_STATUS
} = require("../models/exportModel");

const {
  JobQueue,
  JOB_TYPES,
  JOB_STATUS
} = require("../queues/jobQueue");

const {
  JobWorker
} = require("../workers/jobWorker");

const {
  executeJob
} = require("../workers/jobHandlers");

const {
  queueExportJob
} = require("../services/exportJobService");

const {
  RetryableError,
  NonRetryableError
} = require("../utils/jobErrors");

const {
  FILE_TYPES,
  fileExists,
  deleteFile
} = require("../config/fileStorage");

const {
  sleep
} = require("../utils/retry");

// ==========================================
// 1. WAIT FOR JOB STATUS
// ==========================================

async function waitForStatus(
  queue,
  jobId,
  expectedStatus,
  timeout = 15000
) {

  const start = Date.now();

  while (Date.now() - start < timeout) {

    const job = queue.getJob(jobId);

    if (job?.status === expectedStatus) {
      return job;
    }

    if (
      job &&
      [
        JOB_STATUS.COMPLETED,
        JOB_STATUS.FAILED
      ].includes(job.status)
    ) {

      throw new Error(
        `Unexpected terminal status: ${job.status}`
      );

    }

    await sleep(20);

  }

  throw new Error(
    `Timeout waiting for ${expectedStatus}`
  );

}

// ==========================================
// 2. RUN INTEGRATION TESTS
// ==========================================

async function runTests() {

  console.log(
    "\nMILESTONE 10 - EXPORT QUEUE INTEGRATION"
  );

  const userId = new mongoose.Types.ObjectId();

  const currentUser = {
    id: String(userId),
    role: "user"
  };

  const testTag =
    `queue-export-${randomUUID()}`;

  // Simulated failure configuration.

  const temporaryFailures = new Set();

  const permanentFailures = new Set();

  // Create isolated test queue.

  const queue = new JobQueue({

    maxRetries: 3,

    retryDelay: 1500

  });

  // Create isolated test worker.

  const worker = new JobWorker({

    queue,

    concurrency: 2,

    pollIntervalMs: 50,

    handler: async job => {

      // Simulate a permanent failure.

      if (permanentFailures.has(job.id)) {

        throw new NonRetryableError(
          "Simulated permanent failure"
        );

      }

      // Simulate temporary failure
      // during the first attempt.

      if (
        temporaryFailures.has(job.id) &&
        job.attempts === 1
      ) {

        throw new RetryableError(
          "Simulated temporary failure"
        );

      }

      // Execute actual production handler.

      return executeJob(job);

    }

  });

  try {

    // ======================================
    // DATABASE CONNECTION
    // ======================================

    await mongoose.connect(
      process.env.MONGO_URI
    );

    console.log("MongoDB connected");

    await Export.init();

    await Export.createIndexes();

    // Create isolated test task.

    await Task.create({

      title: "Queue Integration Test Task",

      createdBy: userId,

      status: "completed",

      priority: "high",

      tags: [testTag]

    });

    console.log("Test task created");

    // ======================================
    // TEST 1: JSON EXPORT QUEUE
    // ======================================

    console.log(
      "\n===== TEST 1: JSON QUEUE ====="
    );

    const jsonJob = await queueExportJob(

      FILE_TYPES.JSON,

      currentUser,

      { tag: testTag },

      queue

    );

    // Verify pending job status.

    assert.equal(
      jsonJob.status,
      JOB_STATUS.PENDING
    );

    const pendingRecord =
      await Export.findById(jsonJob.exportId);

    assert.equal(
      pendingRecord.backgroundJobId,
      jsonJob.id
    );

    assert.equal(
      pendingRecord.status,
      EXPORT_STATUS.PENDING
    );

    // Start background worker.

    worker.start();

    const completedJSON = await waitForStatus(

      queue,

      jsonJob.id,

      JOB_STATUS.COMPLETED

    );

    assert.equal(
      completedJSON.result.totalRecords,
      1
    );

    assert.equal(

      await fileExists(
        FILE_TYPES.JSON,
        jsonJob.fileName
      ),

      true

    );

    const completedJSONRecord =
      await Export.findById(jsonJob.exportId);

    assert.equal(
      completedJSONRecord.status,
      EXPORT_STATUS.COMPLETED
    );

    console.log(
      "[PASS] JSON job queued and completed"
    );

    // ======================================
    // TEST 2: CSV EXPORT QUEUE
    // ======================================

    console.log(
      "\n===== TEST 2: CSV QUEUE ====="
    );

    const csvJob = await queueExportJob(

      FILE_TYPES.CSV,

      currentUser,

      { tag: testTag },

      queue

    );

    const completedCSV = await waitForStatus(

      queue,

      csvJob.id,

      JOB_STATUS.COMPLETED

    );

    assert.equal(
      completedCSV.result.totalRecords,
      1
    );

    assert.equal(

      await fileExists(
        FILE_TYPES.CSV,
        csvJob.fileName
      ),

      true

    );

    const completedCSVRecord =
      await Export.findById(csvJob.exportId);

    assert.equal(
      completedCSVRecord.status,
      EXPORT_STATUS.COMPLETED
    );

    console.log(
      "[PASS] CSV job queued and completed"
    );

    // ======================================
    // TEST 3: BACKGROUND REPORT GENERATION
    // ======================================

    console.log(
      "\n===== TEST 3: REPORT QUEUE ====="
    );

    const reportJob = await queueExportJob(

      FILE_TYPES.REPORT,

      currentUser,

      {},

      queue

    );

    const completedReport = await waitForStatus(

      queue,

      reportJob.id,

      JOB_STATUS.COMPLETED

    );

    assert.equal(
      completedReport.result.reportType,
      "taskSummary"
    );

    assert.equal(
      completedReport.result.totalTasks,
      1
    );

    assert.equal(
      completedReport.result.completedTasks,
      1
    );

    assert.equal(
      completedReport.result.completionRate,
      100
    );

    assert.equal(

      await fileExists(
        FILE_TYPES.REPORT,
        reportJob.fileName
      ),

      true

    );

    console.log(
      "[PASS] Background report completed"
    );

    // Stop worker before configuring failures.

    await worker.stop();

    // ======================================
    // TEST 4: TEMPORARY FAILURE AND RETRY
    // ======================================

    console.log(
      "\n===== TEST 4: RETRY ====="
    );

    const retryJob = await queueExportJob(

      FILE_TYPES.JSON,

      currentUser,

      { tag: testTag },

      queue

    );

    // Configure first-attempt failure.

    temporaryFailures.add(retryJob.id);

    worker.start();

    // Verify retrying status.

    await waitForStatus(

      queue,

      retryJob.id,

      JOB_STATUS.RETRYING

    );

    const retryRecord =
      await Export.findById(retryJob.exportId);

    assert.equal(
      retryRecord.status,
      EXPORT_STATUS.RETRYING
    );

    console.log(
      "MongoDB status:",
      retryRecord.status
    );

    // Wait for successful retry.

    const recoveredJob = await waitForStatus(

      queue,

      retryJob.id,

      JOB_STATUS.COMPLETED

    );

    assert.equal(
      recoveredJob.attempts,
      2
    );

    assert.equal(
      recoveredJob.retryCount,
      1
    );

    // Verify same export ID.

    assert.equal(
      recoveredJob.result.exportId,
      retryJob.exportId
    );

    // Verify same filename.

    assert.equal(
      recoveredJob.result.fileName,
      retryJob.fileName
    );

    // Verify duplicate prevention.

    assert.equal(

      await Export.countDocuments({

        backgroundJobId: retryJob.id

      }),

      1

    );

    const recoveredRecord =
      await Export.findById(retryJob.exportId);

    assert.equal(
      recoveredRecord.status,
      EXPORT_STATUS.COMPLETED
    );

    assert.equal(
      recoveredRecord.error,
      null
    );

    assert.equal(
      recoveredRecord.totalRecords,
      1
    );

    assert.equal(
      await fileExists(
        FILE_TYPES.JSON,
        retryJob.fileName
      ),
      true
    );

    console.log(
      "[PASS] Export recovered without duplication"
    );

    // ======================================
    // TEST 5: PERMANENT FAILURE
    // ======================================

    console.log(
      "\n===== TEST 5: PERMANENT FAILURE ====="
    );

    await worker.stop();

    const failedJob = await queueExportJob(

      FILE_TYPES.CSV,

      currentUser,

      { tag: testTag },

      queue

    );

    permanentFailures.add(failedJob.id);

    worker.start();

    const permanentlyFailed =
      await waitForStatus(

        queue,

        failedJob.id,

        JOB_STATUS.FAILED

      );

    // Non-retryable failures must not retry.

    assert.equal(
      permanentlyFailed.attempts,
      1
    );

    assert.equal(
      permanentlyFailed.retryCount,
      0
    );

    assert.equal(
      permanentlyFailed.isPermanentlyFailed,
      true
    );

    const failedRecord =
      await Export.findById(failedJob.exportId);

    // Verify persistent database failure status.

    assert.equal(
      failedRecord.status,
      EXPORT_STATUS.FAILED
    );

    assert.ok(failedRecord.failedAt);

    assert.equal(
      failedRecord.completedAt,
      null
    );

    // Failed job must not have a generated file
    // in this simulated pre-generation failure.

    assert.equal(

      await fileExists(
        FILE_TYPES.CSV,
        failedJob.fileName
      ),

      false

    );

    console.log(
      "[PASS] Permanent failure recorded"
    );

    // ======================================
    // TEST 6: DUPLICATE QUEUE JOB ID
    // ======================================

    console.log(
      "\n===== TEST 6: DUPLICATE JOB ID ====="
    );

    assert.throws(

      () => queue.enqueue(

        JOB_TYPES.JSON_EXPORT,

        {},

        currentUser.id,

        {
          jobId: jsonJob.id
        }

      ),

      {
        statusCode: 409
      }

    );

    console.log(
      "[PASS] Duplicate queue job ID rejected"
    );

    // ======================================
    // TEST 7: QUEUE CAPACITY FAILURE
    // ======================================

    console.log(
      "\n===== TEST 7: QUEUE CAPACITY ====="
    );

    const fullQueue = new JobQueue();

    // Simulate unavailable queue capacity.

    fullQueue.maxActiveJobs = 0;

    const countBefore =
      await Export.countDocuments({
        userId
      });

    await assert.rejects(

      queueExportJob(

        FILE_TYPES.JSON,

        currentUser,

        {},

        fullQueue

      ),

      {
        statusCode: 503
      }

    );

    const countAfter =
      await Export.countDocuments({
        userId
      });

    // The unqueued metadata must be removed.

    assert.equal(
      countBefore,
      countAfter
    );

    console.log(
      "[PASS] Queue submission failure cleaned up"
    );

    // ======================================
    // TEST 8: WORKER STATISTICS
    // ======================================

    console.log(
      "\n===== TEST 8: WORKER STATISTICS ====="
    );

    await worker.stop();

    const stats = worker.getStats();

    assert.equal(
      stats.completed,
      4
    );

    assert.equal(
      stats.failed,
      1
    );

    assert.equal(
      stats.totalProcessed,
      5
    );

    assert.equal(
      stats.totalAttempts,
      6
    );

    assert.equal(
      stats.failedAttempts,
      2
    );

    assert.equal(
      stats.retriesScheduled,
      1
    );

    assert.equal(
      stats.retryAttempts,
      1
    );

    assert.equal(
      stats.recovered,
      1
    );

    assert.equal(
      stats.permanentlyFailed,
      1
    );

    assert.equal(
      stats.activeJobs,
      0
    );

    assert.equal(
      stats.delayedJobs,
      0
    );

    console.log(
      "Worker statistics:",
      stats
    );

    console.log(
      "[PASS] Worker statistics verified"
    );

    // ======================================
    // FINAL TEST RESULTS
    // ======================================

    console.log(
      "\n===================================="
    );

    console.log(
      "ALL 8 EXPORT QUEUE TESTS PASSED"
    );

    console.log(
      "===================================="
    );

  } finally {

    // ======================================
    // CLEANUP
    // ======================================

    await worker.stop();

    try {

      if (
        mongoose.connection.readyState === 1
      ) {

        const records = await Export.find({
          userId
        });

        let filesRemoved = 0;

        // Remove only generated test files.

        for (const record of records) {

          const removed = await deleteFile(

            record.type,

            record.fileName

          );

          if (removed) {
            filesRemoved++;
          }

        }

        // Remove only test export records.

        const exportsRemoved =
          await Export.deleteMany({
            userId
          });

        // Remove only temporary test tasks.

        const tasksRemoved =
          await Task.deleteMany({

            tags: testTag,

            createdBy: userId

          });

        console.log(
          "Generated files removed:",
          filesRemoved
        );

        console.log(
          "Export records removed:",
          exportsRemoved.deletedCount
        );

        console.log(
          "Test tasks removed:",
          tasksRemoved.deletedCount
        );

      }

    } finally {

      await mongoose.disconnect();

      console.log(
        "MongoDB disconnected"
      );

    }

  }

}

// ==========================================
// 3. EXECUTE TESTS
// ==========================================

runTests().catch(error => {

  console.error("[FAIL]", error);

  process.exitCode = 1;

});
