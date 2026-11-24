
require("dotenv").config();

const mongoose = require("mongoose");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");

const Task = require("../models/taskModel");

const {
  Export,
  EXPORT_STATUS,
  MIME_TYPES
} = require("../models/exportModel");

const {
  FILE_TYPES,
  generateFileName,
  getFilePath,
  fileExists,
  deleteFile
} = require("../config/fileStorage");

const {
  processExportJob
} = require("../services/exportJobService");

async function runTests() {

  console.log(
    "\nMILESTONE 10 - EXPORT JOB PROCESSING TESTING"
  );

  const userId = new mongoose.Types.ObjectId();

  const secondUserId =
    new mongoose.Types.ObjectId();

  const testTag =
    `export-job-test-${randomUUID()}`;

  const currentUser = {
    id: String(userId),
    role: "user"
  };

  const generatedRecords = [];

  // ==========================================
  // CREATE TEST EXPORT JOB
  // ==========================================

  async function createTestJob(type) {

    const jobId = randomUUID();

    const record = await Export.create({

      userId,

      backgroundJobId: jobId,

      type,

      fileName: generateFileName(type),

      mimeType: MIME_TYPES[type],

      status: EXPORT_STATUS.PENDING,

      filters:
        type === FILE_TYPES.REPORT
          ? {}
          : { tag: testTag }

    });

    generatedRecords.push(record);

    return {
      record,

      job: {
        id: jobId,
        userId: String(userId),
        payload: {
          exportId: String(record._id),
          currentUser
        }
      }
    };

  }

  try {

    await mongoose.connect(
      process.env.MONGO_URI
    );

    console.log("MongoDB connected");

    await Export.init();
    await Export.createIndexes();

    await Task.insertMany([
      {
        title: "Export Job Task 1",
        status: "completed",
        priority: "high",
        createdBy: userId,
        tags: [testTag]
      },
      {
        title: "Export Job Task 2",
        status: "pending",
        priority: "medium",
        createdBy: secondUserId,
        assignedTo: userId,
        tags: [testTag]
      },
      {
        title: "Private Test Task",
        status: "pending",
        priority: "low",
        createdBy: secondUserId,
        tags: [testTag]
      }
    ]);

    console.log("Three test tasks created");

    // =====================================
    // TEST 1: JSON EXPORT JOB
    // =====================================

    console.log("\n===== TEST 1: JSON EXPORT JOB =====");

    const jsonJob = await createTestJob(
      FILE_TYPES.JSON
    );

    const jsonResult = await processExportJob(
      jsonJob.job,
      FILE_TYPES.JSON
    );

    assert.equal(
      jsonResult.status,
      EXPORT_STATUS.COMPLETED
    );

    assert.equal(jsonResult.totalRecords, 2);

    assert.equal(
      jsonResult.fileName,
      jsonJob.record.fileName
    );

    const jsonContent = await fs.readFile(
      getFilePath(
        FILE_TYPES.JSON,
        jsonResult.fileName
      ),
      "utf8"
    );

    assert.equal(
      JSON.parse(jsonContent).length,
      2
    );

    console.log("[PASS] JSON export job completed");

    // =====================================
    // TEST 2: CSV EXPORT JOB
    // =====================================

    console.log("\n===== TEST 2: CSV EXPORT JOB =====");

    const csvJob = await createTestJob(
      FILE_TYPES.CSV
    );

    const csvResult = await processExportJob(
      csvJob.job,
      FILE_TYPES.CSV
    );

    assert.equal(
      csvResult.totalRecords,
      2
    );

    assert.equal(
      csvResult.status,
      EXPORT_STATUS.COMPLETED
    );

    assert.equal(
      await fileExists(
        FILE_TYPES.CSV,
        csvResult.fileName
      ),
      true
    );

    console.log("[PASS] CSV export job completed");

    // =====================================
    // TEST 3: TASK REPORT JOB
    // =====================================

    console.log("\n===== TEST 3: TASK REPORT JOB =====");

    const reportJob = await createTestJob(
      FILE_TYPES.REPORT
    );

    const reportResult = await processExportJob(
      reportJob.job,
      FILE_TYPES.REPORT
    );

    assert.equal(
      reportResult.reportType,
      "taskSummary"
    );

    assert.equal(reportResult.totalTasks, 2);

    assert.equal(
      reportResult.completedTasks,
      1
    );

    assert.equal(
      reportResult.completionRate,
      50
    );

    console.log("[PASS] Task report job completed");

    // =====================================
    // TEST 4: PERSISTENT METADATA
    // =====================================

    console.log("\n===== TEST 4: PERSISTENT METADATA =====");

    const savedRecord = await Export.findById(
      jsonJob.record._id
    );

    assert.equal(
      savedRecord.status,
      EXPORT_STATUS.COMPLETED
    );

    assert.equal(
      savedRecord.totalRecords,
      2
    );

    assert.ok(savedRecord.size > 0);

    assert.ok(savedRecord.completedAt);

    console.log("[PASS] Export metadata persisted");

    // =====================================
    // TEST 5: REPEATED JOB EXECUTION
    // =====================================

    console.log("\n===== TEST 5: IDEMPOTENCY =====");

    const originalPath = getFilePath(
      FILE_TYPES.JSON,
      jsonResult.fileName
    );

    const originalFileInfo =
      await fs.stat(originalPath);

    const repeatedResult =
      await processExportJob(
        jsonJob.job,
        FILE_TYPES.JSON
      );

    const repeatedFileInfo =
      await fs.stat(originalPath);

    assert.equal(
      repeatedResult.exportId,
      jsonResult.exportId
    );

    assert.equal(
      repeatedResult.fileName,
      jsonResult.fileName
    );

    assert.equal(
      repeatedFileInfo.mtimeMs,
      originalFileInfo.mtimeMs
    );

    assert.equal(
      await Export.countDocuments({
        backgroundJobId: jsonJob.job.id
      }),
      1
    );

    console.log(
      "[PASS] Completed export reused without duplicate generation"
    );

    // =====================================
    // TEST 6: RESTORE COMPLETED REPORT
    // =====================================

    console.log("\n===== TEST 6: RESTORE REPORT =====");

    const restoredReport =
      await processExportJob(
        reportJob.job,
        FILE_TYPES.REPORT
      );

    assert.equal(
      restoredReport.fileName,
      reportResult.fileName
    );

    assert.equal(
      restoredReport.totalTasks,
      reportResult.totalTasks
    );

    assert.equal(
      restoredReport.generatedAt,
      reportResult.generatedAt
    );

    console.log("[PASS] Existing report restored");

    // =====================================
    // TEST 7: JOB ID MISMATCH
    // =====================================

    console.log("\n===== TEST 7: JOB ID VALIDATION =====");

    await assert.rejects(

      processExportJob(
        {
          ...jsonJob.job,
          id: randomUUID()
        },
        FILE_TYPES.JSON
      ),

      { name: "NonRetryableError" }

    );

    console.log("[PASS] Invalid job identity rejected");

    // =====================================
    // TEST 8: OWNERSHIP VALIDATION
    // =====================================

    console.log("\n===== TEST 8: OWNERSHIP VALIDATION =====");

    await assert.rejects(

      processExportJob(
        {
          ...jsonJob.job,
          userId: String(secondUserId),
          payload: {
            ...jsonJob.job.payload,
            currentUser: {
              id: String(secondUserId),
              role: "user"
            }
          }
        },
        FILE_TYPES.JSON
      ),

      { name: "NonRetryableError" }

    );

    console.log("[PASS] Unauthorized export job rejected");

    // =====================================
    // TEST 9: INVALID EXPORT TYPE
    // =====================================

    console.log("\n===== TEST 9: EXPORT TYPE VALIDATION =====");

    await assert.rejects(

      processExportJob(
        jsonJob.job,
        FILE_TYPES.CSV
      ),

      { name: "NonRetryableError" }

    );

    console.log("[PASS] Incorrect export type rejected");

    // =====================================
    // TEST 10: MISSING EXPORT
    // =====================================

    console.log("\n===== TEST 10: MISSING EXPORT =====");

    await assert.rejects(

      processExportJob(
        {
          ...jsonJob.job,
          payload: {
            ...jsonJob.job.payload,
            exportId: String(
              new mongoose.Types.ObjectId()
            )
          }
        },
        FILE_TYPES.JSON
      ),

      { name: "NonRetryableError" }

    );

    console.log("[PASS] Missing export record handled");

    console.log("\n====================================");
    console.log("ALL 10 EXPORT JOB TESTS PASSED");
    console.log("====================================");

  } finally {

    try {

      for (const record of generatedRecords) {

        await deleteFile(
          record.type,
          record.fileName
        );

      }

      console.log(
        "Generated files cleaned:",
        generatedRecords.length
      );

    } finally {

      try {

        if (mongoose.connection.readyState === 1) {

          const exportsRemoved =
            await Export.deleteMany({
              userId
            });

          const tasksRemoved =
            await Task.deleteMany({
              tags: testTag
            });

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

        console.log("MongoDB disconnected");

      }

    }

  }

}

runTests().catch(error => {

  console.error("[FAIL]", error);

  process.exitCode = 1;

});
