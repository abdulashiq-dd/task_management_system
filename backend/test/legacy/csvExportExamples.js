
require("dotenv").config();
if (!/\/task_hardening_test_[a-f0-9]{32}(?:\?|$)/.test(process.env.MONGO_URI || "")) throw new Error("Run database tests through npm test; an isolated database is required.");

const mongoose = require("mongoose");
const fs = require("node:fs/promises");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const Task = require("../../src/models/taskModel");

const {
  exportTasksAsCSV
} = require("../../src/services/exportService");

const {
  FILE_TYPES,
  getFilePath,
  deleteFile
} = require("../../src/config/fileStorage");

const {
  CSV_COLUMNS,
  escapeCSVValue,
  generateCSVHeader,
  generateCSVRow
} = require("../../src/utils/csvUtils");

async function runTests() {

  console.log("\nMILESTONE 10 - CSV EXPORT TESTING");

  const userId = new mongoose.Types.ObjectId();
  const secondUserId = new mongoose.Types.ObjectId();
  const thirdUserId = new mongoose.Types.ObjectId();

  const testTag = `csv-test-${randomUUID()}`;

  const currentUser = {
    id: String(userId),
    role: "user"
  };

  const adminUser = {
    id: String(userId),
    role: "admin"
  };

  const generatedFiles = [];

  async function generateExport(user, filters = {}) {

    const result = await exportTasksAsCSV(
      user,
      filters
    );

    generatedFiles.push(result.fileName);

    const content = await fs.readFile(

      getFilePath(
        FILE_TYPES.CSV,
        result.fileName
      ),

      "utf8"

    );

    return {
      result,
      content
    };

  }

  try {

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected");

    await Task.insertMany([
      {
        title: "Develop API, Version 2",
        description: 'He said "Done"',
        status: "completed",
        priority: "high",
        createdBy: userId,
        tags: [testTag]
      },
      {
        title: "Implement CSV Export",
        description: "First line\nSecond line",
        status: "in_progress",
        priority: "high",
        createdBy: userId,
        tags: [testTag]
      },
      {
        title: "=1+1",
        status: "pending",
        priority: "medium",
        createdBy: secondUserId,
        assignedTo: userId,
        tags: [testTag]
      },
      {
        title: "Confidential Private Task",
        status: "completed",
        priority: "low",
        createdBy: thirdUserId,
        tags: [testTag]
      }
    ]);

    console.log("Four test tasks created");


    // =====================================
    // TEST 1: CSV HEADER
    // =====================================

    console.log("\n===== TEST 1: CSV HEADER =====");

    const expectedHeader =
      '"id","title","description","status",' +
      '"priority","dueDate","tags","isOverdue",' +
      '"overdueAt","createdBy","assignedTo",' +
      '"createdAt","updatedAt"\r\n';

    assert.equal(CSV_COLUMNS.length, 13);

    assert.equal(
      generateCSVHeader(),
      expectedHeader
    );

    console.log("[PASS] CSV header generated correctly");


    // =====================================
    // TEST 2: AUTHORIZED CSV EXPORT
    // =====================================

    console.log("\n===== TEST 2: AUTHORIZED EXPORT =====");

    const userExport = await generateExport(
      currentUser,
      { tag: testTag }
    );

    assert.equal(
      userExport.result.totalRecords,
      3
    );

    assert.ok(
      userExport.content.startsWith(
        "\uFEFF" + expectedHeader
      )
    );

    assert.ok(
      userExport.content.includes(
        "Implement CSV Export"
      )
    );

    assert.ok(
      !userExport.content.includes(
        "Confidential Private Task"
      )
    );

    console.log("[PASS] Authorized tasks exported");


    // =====================================
    // TEST 3: ADMIN CSV EXPORT
    // =====================================

    console.log("\n===== TEST 3: ADMIN EXPORT =====");

    const adminExport = await generateExport(
      adminUser,
      { tag: testTag }
    );

    assert.equal(
      adminExport.result.totalRecords,
      4
    );

    assert.ok(
      adminExport.content.includes(
        "Confidential Private Task"
      )
    );

    console.log("[PASS] Admin export verified");


    // =====================================
    // TEST 4: EXPORT FILTERS
    // =====================================

    console.log("\n===== TEST 4: EXPORT FILTERS =====");

    const filteredExport = await generateExport(
      currentUser,
      {
        tag: testTag,
        status: "completed",
        priority: "high"
      }
    );

    assert.equal(
      filteredExport.result.totalRecords,
      1
    );

    assert.ok(
      filteredExport.content.includes(
        "Develop API, Version 2"
      )
    );

    const privateExport = await generateExport(
      currentUser,
      {
        tag: testTag,
        search: "Confidential Private Task"
      }
    );

    assert.equal(
      privateExport.result.totalRecords,
      0
    );

    console.log("[PASS] CSV filters and authorization verified");


    // =====================================
    // TEST 5: COMMA ESCAPING
    // =====================================

    console.log("\n===== TEST 5: COMMA ESCAPING =====");

    assert.equal(
      escapeCSVValue("Review, Test"),
      '"Review, Test"'
    );

    assert.ok(
      userExport.content.includes(
        '"Develop API, Version 2"'
      )
    );

    console.log("[PASS] Commas escaped correctly");


    // =====================================
    // TEST 6: DOUBLE QUOTE ESCAPING
    // =====================================

    console.log("\n===== TEST 6: DOUBLE QUOTES =====");

    assert.equal(
      escapeCSVValue('He said "Done"'),
      '"He said ""Done"""'
    );

    assert.ok(
      userExport.content.includes(
        '"He said ""Done"""'
      )
    );

    console.log("[PASS] Double quotes escaped correctly");


    // =====================================
    // TEST 7: LINE BREAK ESCAPING
    // =====================================

    console.log("\n===== TEST 7: LINE BREAKS =====");

    assert.equal(
      escapeCSVValue("First line\nSecond line"),
      '"First line\nSecond line"'
    );

    assert.ok(
      userExport.content.includes(
        '"First line\nSecond line"'
      )
    );

    console.log("[PASS] Line breaks handled correctly");


    // =====================================
    // TEST 8: FORMULA INJECTION PROTECTION
    // =====================================

    console.log("\n===== TEST 8: FORMULA INJECTION =====");

    const unsafeValues = [
      "=1+1",
      "+1+1",
      "-1+1",
      "@SUM(1,2)",
      "   =1+1",
      "\t=1+1",
      "＝1+1"
    ];

    for (const value of unsafeValues) {

      assert.ok(
        escapeCSVValue(value).startsWith("\"'")
      );

      console.log("Protected:", value);

    }

    assert.ok(
      userExport.content.includes("\"'=1+1\"")
    );

    console.log("[PASS] Formula injection protection verified");


    // =====================================
    // TEST 9: EMPTY CSV EXPORT
    // =====================================

    console.log("\n===== TEST 9: EMPTY EXPORT =====");

    const emptyExport = await generateExport(
      currentUser,
      { tag: randomUUID() }
    );

    assert.equal(
      emptyExport.result.totalRecords,
      0
    );

    assert.equal(
      emptyExport.content,
      "\uFEFF" + expectedHeader
    );

    console.log("[PASS] Empty CSV contains valid header");


    // =====================================
    // TEST 10: TYPES AND FILE METADATA
    // =====================================

    console.log("\n===== TEST 10: FILE METADATA =====");

    assert.equal(
      userExport.result.size,
      Buffer.byteLength(
        userExport.content,
        "utf8"
      )
    );

    assert.equal(
      userExport.result.type,
      FILE_TYPES.CSV
    );

    assert.equal(
      userExport.result.mimeType,
      "text/csv"
    );

    assert.equal(
      escapeCSVValue(null),
      '""'
    );

    assert.equal(
      escapeCSVValue(false),
      '"false"'
    );

    assert.equal(
      escapeCSVValue(
        new Date("2026-01-01T00:00:00Z")
      ),
      '"2026-01-01T00:00:00.000Z"'
    );

    assert.equal(
      escapeCSVValue(["backend", "export"]),
      '"[""backend"",""export""]"'
    );

    console.log("Metadata:", userExport.result);

    console.log("[PASS] CSV metadata and data types verified");


    // =====================================
    // TEST 11: INVALID REQUESTS
    // =====================================

    console.log("\n===== TEST 11: INVALID REQUESTS =====");

    await assert.rejects(
      exportTasksAsCSV(null),
      { statusCode: 401 }
    );

    await assert.rejects(

      exportTasksAsCSV(
        currentUser,
        { status: "invalid" }
      ),

      { statusCode: 400 }

    );

    await assert.rejects(

      exportTasksAsCSV(
        currentUser,
        { createdBy: thirdUserId }
      ),

      { statusCode: 400 }

    );

    console.log("[PASS] Invalid CSV requests rejected");


    // =====================================
    // TEST 12: UNIQUE FILES AND ROW FORMAT
    // =====================================

    console.log("\n===== TEST 12: UNIQUE FILES =====");

    assert.equal(
      new Set(generatedFiles).size,
      generatedFiles.length
    );

    const row = generateCSVRow({
      id: "1",
      title: "Example Task"
    });

    assert.equal(
      row,
      ['"1"', '"Example Task"',
        ...Array(11).fill('""')]
        .join(",") + "\r\n"
    );

    console.log("[PASS] Unique CSV files and row format verified");


    console.log("\n====================================");
    console.log("ALL 12 CSV EXPORT TESTS PASSED");
    console.log("====================================");

  } finally {

    try {

      for (const fileName of generatedFiles) {

        await deleteFile(
          FILE_TYPES.CSV,
          fileName
        );

      }

      console.log(
        "Generated test files removed:",
        generatedFiles.length
      );

      if (mongoose.connection.readyState === 1) {

        const result = await Task.deleteMany({
          tags: testTag
        });

        console.log(
          "Test tasks removed:",
          result.deletedCount
        );

      }

    } finally {

      await mongoose.disconnect();

      console.log("MongoDB disconnected");

    }

  }

}

runTests().catch(error => {

  console.error("[FAIL]", error.message);

  process.exitCode = 1;

});
