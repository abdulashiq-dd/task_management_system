
require("dotenv").config();
if (!/\/task_hardening_test_[a-f0-9]{32}(?:\?|$)/.test(process.env.MONGO_URI || "")) throw new Error("Run database tests through npm test; an isolated database is required.");

const mongoose = require("mongoose");
const fs = require("node:fs/promises");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const Task = require("../../src/models/taskModel");

const {
  exportTasksAsJSON
} = require("../../src/services/exportService");

const {
  FILE_TYPES,
  getFilePath,
  deleteFile
} = require("../../src/config/fileStorage");

async function runTests() {

  console.log("\nMILESTONE 10 - JSON EXPORT TESTING");

  const userId = new mongoose.Types.ObjectId();
  const secondUserId = new mongoose.Types.ObjectId();
  const thirdUserId = new mongoose.Types.ObjectId();

  const testTag = `export-test-${randomUUID()}`;

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

    const result = await exportTasksAsJSON(
      user,
      filters
    );

    generatedFiles.push(result.fileName);

    const content = await fs.readFile(

      getFilePath(
        FILE_TYPES.JSON,
        result.fileName
      ),

      "utf8"

    );

    return {
      result,
      content,
      tasks: JSON.parse(content)
    };

  }

  try {

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected");

    // Create isolated test tasks.

    await Task.insertMany([
      {
        title: "Develop API",
        status: "completed",
        priority: "high",
        createdBy: userId,
        tags: [testTag]
      },
      {
        title: "Implement JSON Export",
        status: "in_progress",
        priority: "high",
        createdBy: userId,
        tags: [testTag]
      },
      {
        title: "Assigned Reporting Task",
        status: "pending",
        priority: "medium",
        createdBy: secondUserId,
        assignedTo: userId,
        tags: [testTag]
      },
      {
        title: "Private User Task",
        status: "completed",
        priority: "low",
        createdBy: thirdUserId,
        tags: [testTag]
      }
    ]);

    console.log("Four test tasks created");


    // TEST 1: AUTHORIZED EXPORT

    console.log("\n===== TEST 1: AUTHORIZED EXPORT =====");

    const userExport = await generateExport(
      currentUser,
      { tag: testTag }
    );

    assert.equal(userExport.tasks.length, 3);

    assert.equal(
      userExport.result.totalRecords,
      3
    );

    console.log("Exported tasks:", userExport.tasks.length);

    console.log("[PASS] Authorized tasks exported");


    // TEST 2: OWNERSHIP PROTECTION

    console.log("\n===== TEST 2: OWNERSHIP PROTECTION =====");

    assert.ok(

      userExport.tasks.every(task =>

        task.createdBy === currentUser.id ||

        task.assignedTo === currentUser.id

      )

    );

    assert.ok(

      !userExport.tasks.some(task =>

        task.title === "Private User Task"

      )

    );

    console.log("[PASS] Unauthorized tasks excluded");


    // TEST 3: ADMIN EXPORT

    console.log("\n===== TEST 3: ADMIN EXPORT =====");

    const adminExport = await generateExport(
      adminUser,
      { tag: testTag }
    );

    assert.equal(adminExport.tasks.length, 4);

    console.log("[PASS] Admin export verified");


    // TEST 4: STATUS FILTER

    console.log("\n===== TEST 4: STATUS FILTER =====");

    const completedExport = await generateExport(
      currentUser,
      {
        tag: testTag,
        status: "completed"
      }
    );

    assert.equal(completedExport.tasks.length, 1);

    assert.equal(
      completedExport.tasks[0].status,
      "completed"
    );

    console.log("[PASS] Status filter verified");


    // TEST 5: PRIORITY FILTER

    console.log("\n===== TEST 5: PRIORITY FILTER =====");

    const priorityExport = await generateExport(
      currentUser,
      {
        tag: testTag,
        priority: "high"
      }
    );

    assert.equal(priorityExport.tasks.length, 2);

    console.log("[PASS] Priority filter verified");


    // TEST 6: SEARCH FILTER

    console.log("\n===== TEST 6: SEARCH FILTER =====");

    const searchExport = await generateExport(
      currentUser,
      {
        tag: testTag,
        search: "JSON Export"
      }
    );

    assert.equal(searchExport.tasks.length, 1);

    assert.equal(
      searchExport.tasks[0].title,
      "Implement JSON Export"
    );

    console.log("[PASS] Search filter verified");


    // TEST 7: EMPTY EXPORT

    console.log("\n===== TEST 7: EMPTY EXPORT =====");

    const emptyExport = await generateExport(
      currentUser,
      {
        tag: randomUUID()
      }
    );

    assert.deepEqual(emptyExport.tasks, []);

    assert.equal(
      emptyExport.result.totalRecords,
      0
    );

    console.log("[PASS] Empty JSON export is valid");


    // TEST 8: FILE METADATA

    console.log("\n===== TEST 8: FILE METADATA =====");

    assert.equal(
      userExport.result.size,
      Buffer.byteLength(userExport.content, "utf8")
    );

    assert.equal(
      userExport.result.mimeType,
      "application/json"
    );

    assert.equal(
      userExport.result.type,
      FILE_TYPES.JSON
    );

    console.log("Metadata:", userExport.result);

    console.log("[PASS] Export metadata verified");


    // TEST 9: UNAUTHENTICATED ACCESS

    console.log("\n===== TEST 9: AUTHENTICATION =====");

    await assert.rejects(

      exportTasksAsJSON(null),

      { statusCode: 401 }

    );

    console.log("[PASS] Unauthenticated export rejected");


    // TEST 10: INVALID FILTERS

    console.log("\n===== TEST 10: INVALID FILTERS =====");

    await assert.rejects(

      exportTasksAsJSON(
        currentUser,
        { status: "invalid" }
      ),

      { statusCode: 400 }

    );

    await assert.rejects(

      exportTasksAsJSON(
        currentUser,
        { createdBy: thirdUserId }
      ),

      { statusCode: 400 }

    );

    console.log("[PASS] Invalid filters rejected");


    // TEST 11: SEARCH AUTHORIZATION

    console.log("\n===== TEST 11: SEARCH AUTHORIZATION =====");

    const privateExport = await generateExport(
      currentUser,
      {
        tag: testTag,
        search: "Private User Task"
      }
    );

    assert.equal(
      privateExport.tasks.length,
      0
    );

    console.log("[PASS] Search cannot bypass authorization");


    // TEST 12: UNIQUE EXPORT FILES

    console.log("\n===== TEST 12: UNIQUE FILES =====");

    assert.equal(

      new Set(generatedFiles).size,

      generatedFiles.length

    );

    console.log("[PASS] Unique export files generated");


    console.log("\n====================================");
    console.log("ALL 12 JSON EXPORT TESTS PASSED");
    console.log("====================================");

  } finally {

    try {

      for (const fileName of generatedFiles) {

        await deleteFile(
          FILE_TYPES.JSON,
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
