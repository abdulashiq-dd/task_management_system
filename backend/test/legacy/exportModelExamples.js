
require("dotenv").config();
if (!/\/task_hardening_test_[a-f0-9]{32}(?:\?|$)/.test(process.env.MONGO_URI || "")) throw new Error("Run database tests through npm test; an isolated database is required.");

const mongoose = require("mongoose");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const {
  Export,
  EXPORT_STATUS,
  MIME_TYPES
} = require("../../src/models/exportModel");

const {
  FILE_TYPES,
  generateFileName
} = require("../../src/config/fileStorage");

async function runTests() {

  console.log("\nMILESTONE 10 - EXPORT MODEL TESTING");

  const testUserId = new mongoose.Types.ObjectId();
  const secondUserId = new mongoose.Types.ObjectId();

  function createTestData(overrides = {}) {

    const type = overrides.type || FILE_TYPES.JSON;

    return {
      userId: testUserId,
      backgroundJobId: randomUUID(),
      type,
      fileName: generateFileName(type),
      mimeType: MIME_TYPES[type],
      ...overrides
    };

  }

  try {

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected");

    await Export.init();
    await Export.createIndexes();

    console.log("Export indexes initialized");


    // =====================================
    // TEST 1: CREATE EXPORT
    // =====================================

    console.log("\n===== TEST 1: CREATE EXPORT =====");

    const exportRecord = await Export.create(
      createTestData()
    );

    assert.equal(
      exportRecord.status,
      EXPORT_STATUS.PENDING
    );

    assert.equal(exportRecord.size, 0);

    assert.equal(exportRecord.totalRecords, 0);

    assert.equal(exportRecord.isDownloadable, false);

    console.log("Export ID:", exportRecord._id);

    console.log("[PASS] Export created successfully");


    // =====================================
    // TEST 2: INVALID EXPORT TYPE
    // =====================================

    console.log("\n===== TEST 2: INVALID EXPORT TYPE =====");

    const invalidExport = new Export(
      createTestData({
        type: FILE_TYPES.JSON
      })
    );

    invalidExport.type = "pdf";

    await assert.rejects(

      invalidExport.validate(),

      { name: "ValidationError" }

    );

    console.log("[PASS] Invalid export type rejected");


    // =====================================
    // TEST 3: INVALID FILE NAME
    // =====================================

    console.log("\n===== TEST 3: INVALID FILE NAME =====");

    await assert.rejects(

      Export.create(
        createTestData({
          fileName: "../../secret.json"
        })
      ),

      { name: "ValidationError" }

    );

    console.log("[PASS] Unsafe file name rejected");


    // =====================================
    // TEST 4: NEGATIVE FILE SIZE
    // =====================================

    console.log("\n===== TEST 4: INVALID FILE SIZE =====");

    await assert.rejects(

      Export.create(
        createTestData({
          size: -100
        })
      ),

      { name: "ValidationError" }

    );

    console.log("[PASS] Invalid file size rejected");


    // =====================================
    // TEST 5: DUPLICATE BACKGROUND JOB
    // =====================================

    console.log("\n===== TEST 5: DUPLICATE JOB ID =====");

    await assert.rejects(

      Export.create(
        createTestData({
          backgroundJobId:
            exportRecord.backgroundJobId
        })
      ),

      { code: 11000 }

    );

    console.log("[PASS] Duplicate background job prevented");


    // =====================================
    // TEST 6: PROCESSING STATUS
    // =====================================

    console.log("\n===== TEST 6: PROCESSING STATUS =====");

    exportRecord.status = EXPORT_STATUS.PROCESSING;

    await exportRecord.save();

    assert.equal(
      exportRecord.status,
      EXPORT_STATUS.PROCESSING
    );

    assert.equal(
      exportRecord.isDownloadable,
      false
    );

    console.log("[PASS] Export marked as processing");


    // =====================================
    // TEST 7: COMPLETED STATUS
    // =====================================

    console.log("\n===== TEST 7: COMPLETED STATUS =====");

    exportRecord.status = EXPORT_STATUS.COMPLETED;
    exportRecord.size = 2048;
    exportRecord.totalRecords = 100;
    exportRecord.completedAt = new Date();

    await exportRecord.save();

    assert.equal(
      exportRecord.status,
      EXPORT_STATUS.COMPLETED
    );

    assert.equal(exportRecord.size, 2048);

    assert.equal(exportRecord.totalRecords, 100);

    assert.equal(exportRecord.isDownloadable, true);

    console.log("[PASS] Completed export metadata verified");


    // =====================================
    // TEST 8: RETRY AND FAILURE STATUS
    // =====================================

    console.log("\n===== TEST 8: RETRY AND FAILURE =====");

    const failedExport = await Export.create(
      createTestData({
        type: FILE_TYPES.CSV
      })
    );

    failedExport.status = EXPORT_STATUS.PROCESSING;

    await failedExport.save();

    failedExport.status = EXPORT_STATUS.RETRYING;

    await failedExport.save();

    assert.equal(
      failedExport.status,
      EXPORT_STATUS.RETRYING
    );

    failedExport.status = EXPORT_STATUS.PROCESSING;

    await failedExport.save();

    failedExport.status = EXPORT_STATUS.FAILED;
    failedExport.error = "Export generation failed";
    failedExport.failedAt = new Date();

    await failedExport.save();

    assert.equal(
      failedExport.status,
      EXPORT_STATUS.FAILED
    );

    assert.equal(failedExport.isDownloadable, false);

    console.log("[PASS] Retry and failure metadata verified");


    // =====================================
    // TEST 9: USER-BASED QUERY
    // =====================================

    console.log("\n===== TEST 9: USER-BASED QUERY =====");

    const anotherExport = await Export.create(
      createTestData({
        userId: secondUserId
      })
    );

    const userExports = await Export.find({
      userId: testUserId
    });

    assert.equal(userExports.length, 2);

    assert.ok(

      userExports.every(record =>

        String(record.userId) === String(testUserId)

      )

    );

    assert.ok(

      !userExports.some(record =>

        String(record._id) === String(anotherExport._id)

      )

    );

    console.log("[PASS] User-based export query verified");


    // =====================================
    // TEST 10: EXPORT FILTERS
    // =====================================

    console.log("\n===== TEST 10: EXPORT FILTERS =====");

    const filteredExport = await Export.create(
      createTestData({
        filters: {
          status: "completed",
          priority: "high",
          tag: "backend"
        }
      })
    );

    assert.equal(
      filteredExport.filters.status,
      "completed"
    );

    assert.equal(
      filteredExport.filters.priority,
      "high"
    );

    assert.equal(
      filteredExport.filters.tag,
      "backend"
    );

    console.log("[PASS] Export filters stored successfully");


    // =====================================
    // TEST 11: DATABASE INDEXES
    // =====================================

    console.log("\n===== TEST 11: DATABASE INDEXES =====");

    const indexes =
      await Export.collection.indexes();

    const jobIndex = indexes.find(

      index =>
        index.key.backgroundJobId === 1 &&
        index.unique === true

    );

    assert.ok(jobIndex);

    console.log("[PASS] Required unique index exists");


    // =====================================
    // TEST 12: MIME TYPE VALIDATION
    // =====================================

    console.log("\n===== TEST 12: MIME TYPE VALIDATION =====");

    await assert.rejects(

      Export.create(
        createTestData({
          type: FILE_TYPES.CSV,
          mimeType: "application/json"
        })
      ),

      { name: "ValidationError" }

    );

    console.log("[PASS] Incorrect MIME type rejected");


    console.log("\n====================================");
    console.log("ALL 12 EXPORT MODEL TESTS PASSED");
    console.log("====================================");

  } finally {

    if (mongoose.connection.readyState === 1) {

      const result = await Export.deleteMany({

        userId: {
          $in: [testUserId, secondUserId]
        }

      });

      console.log(
        "Test records removed:",
        result.deletedCount
      );

      await mongoose.disconnect();

      console.log("MongoDB disconnected");

    }

  }

}

runTests().catch(error => {

  console.error("[FAIL]", error.message);

  process.exitCode = 1;

});
