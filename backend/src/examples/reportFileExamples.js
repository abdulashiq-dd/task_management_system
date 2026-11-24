
require("dotenv").config();

const mongoose = require("mongoose");
const fs = require("node:fs/promises");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const Task = require("../models/taskModel");

const dashboardService =
  require("../services/dashboardService");

const {
  calculateCompletionRate,
  generateTaskSummary,
  generateTaskSummaryReport
} = require("../services/reportFileService");

const {
  FILE_TYPES,
  getFilePath,
  deleteFile
} = require("../config/fileStorage");

async function runTests() {

  console.log(
    "\nMILESTONE 10 - TASK REPORT TESTING"
  );

  const userId = new mongoose.Types.ObjectId();

  const secondUserId =
    new mongoose.Types.ObjectId();

  const thirdUserId =
    new mongoose.Types.ObjectId();

  const emptyUserId =
    new mongoose.Types.ObjectId();

  const testTag = `report-test-${randomUUID()}`;

  const currentUser = {
    id: String(userId),
    role: "user"
  };

  const adminUser = {
    id: String(userId),
    role: "admin"
  };

  const emptyUser = {
    id: String(emptyUserId),
    role: "user"
  };

  const generatedFiles = [];

  async function generateReport(user) {

    const result =
      await generateTaskSummaryReport(user);

    generatedFiles.push(result.fileName);

    const content = await fs.readFile(

      getFilePath(
        FILE_TYPES.REPORT,
        result.fileName
      ),

      "utf8"

    );

    return {
      result,
      content,
      report: JSON.parse(content)
    };

  }

  try {

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected");


    // Create isolated test tasks.

    await Task.insertMany([
      {
        title: "Develop Backend",
        status: "completed",
        priority: "high",
        createdBy: userId,
        tags: [testTag]
      },
      {
        title: "Implement Reports",
        status: "completed",
        priority: "medium",
        createdBy: userId,
        tags: [testTag]
      },
      {
        title: "Assigned Testing Task",
        status: "pending",
        priority: "high",
        createdBy: secondUserId,
        assignedTo: userId,
        dueDate: new Date(Date.now() - 86400000),
        isOverdue: true,
        overdueAt: new Date(),
        tags: [testTag]
      },
      {
        title: "Private Task",
        status: "completed",
        priority: "low",
        createdBy: thirdUserId,
        tags: [testTag]
      }
    ]);

    console.log("Four test tasks created");


    // =====================================
    // TEST 1: COMPLETION RATE
    // =====================================

    console.log("\n===== TEST 1: COMPLETION RATE =====");

    assert.equal(
      calculateCompletionRate(2, 3),
      66.67
    );

    assert.equal(
      calculateCompletionRate(5, 10),
      50
    );

    assert.equal(
      calculateCompletionRate(10, 10),
      100
    );

    assert.equal(
      calculateCompletionRate(0, 0),
      0
    );

    console.log("[PASS] Completion rate calculation verified");


    // =====================================
    // TEST 2: USER TASK SUMMARY
    // =====================================

    console.log("\n===== TEST 2: USER TASK SUMMARY =====");

    const summary = await generateTaskSummary(
      currentUser
    );

    assert.equal(summary.totalTasks, 3);

    assert.equal(summary.completedTasks, 2);

    assert.equal(summary.pendingTasks, 1);

    assert.equal(summary.completionRate, 66.67);

    assert.equal(summary.scope, "authorized_tasks");

    console.log("Summary:", summary);

    console.log("[PASS] User task summary verified");


    // =====================================
    // TEST 3: GENERATE REPORT FILE
    // =====================================

    console.log("\n===== TEST 3: REPORT FILE =====");

    const userReport = await generateReport(
      currentUser
    );

    assert.equal(
      userReport.report.reportType,
      "taskSummary"
    );

    assert.equal(
      userReport.report.totalTasks,
      3
    );

    assert.equal(
      userReport.report.generatedBy,
      currentUser.id
    );

    assert.ok(
      !Number.isNaN(
        Date.parse(userReport.report.generatedAt)
      )
    );

    console.log("[PASS] JSON report file generated");


    // =====================================
    // TEST 4: FILE METADATA
    // =====================================

    console.log("\n===== TEST 4: FILE METADATA =====");

    assert.equal(
      userReport.result.type,
      FILE_TYPES.REPORT
    );

    assert.equal(
      userReport.result.mimeType,
      "application/json"
    );

    assert.equal(
      userReport.result.totalRecords,
      3
    );

    assert.equal(
      userReport.result.size,
      Buffer.byteLength(userReport.content)
    );

    assert.deepEqual(
      userReport.report,
      userReport.result.report
    );

    console.log("[PASS] Report file metadata verified");


    // =====================================
    // TEST 5: ADMIN REPORT
    // =====================================

    console.log("\n===== TEST 5: ADMIN REPORT =====");

    const adminStats =
      await dashboardService.getDashboardStats(
        adminUser
      );

    const adminReport = await generateReport(
      adminUser
    );

    assert.equal(
      adminReport.report.scope,
      "all_tasks"
    );

    assert.equal(
      adminReport.report.totalTasks,
      adminStats.totalTasks
    );

    assert.ok(
      adminReport.report.totalTasks >= 4
    );

    console.log("[PASS] Admin report verified");


    // =====================================
    // TEST 6: EMPTY USER REPORT
    // =====================================

    console.log("\n===== TEST 6: EMPTY REPORT =====");

    const emptyReport = await generateReport(
      emptyUser
    );

    assert.equal(
      emptyReport.report.totalTasks,
      0
    );

    assert.equal(
      emptyReport.report.completedTasks,
      0
    );

    assert.equal(
      emptyReport.report.completionRate,
      0
    );

    assert.equal(
      emptyReport.result.totalRecords,
      0
    );

    console.log("[PASS] Empty report generated correctly");


    // =====================================
    // TEST 7: DASHBOARD CONSISTENCY
    // =====================================

    console.log("\n===== TEST 7: DASHBOARD CONSISTENCY =====");

    const dashboard =
      await dashboardService.getDashboardStats(
        currentUser
      );

    assert.equal(
      userReport.report.totalTasks,
      dashboard.totalTasks
    );

    assert.equal(
      userReport.report.completedTasks,
      dashboard.completedTasks
    );

    assert.equal(
      userReport.report.overdueTasks,
      dashboard.overdueTasks
    );

    assert.deepEqual(
      userReport.report.tasksByPriority,
      dashboard.tasksByPriority
    );

    console.log("[PASS] Report matches dashboard statistics");


    // =====================================
    // TEST 8: AUTHENTICATION
    // =====================================

    console.log("\n===== TEST 8: AUTHENTICATION =====");

    await assert.rejects(

      generateTaskSummaryReport(null),

      { statusCode: 401 }

    );

    console.log("[PASS] Unauthenticated report rejected");


    // =====================================
    // TEST 9: INVALID ROLE AND FILE NAME
    // =====================================

    console.log("\n===== TEST 9: SECURITY VALIDATION =====");

    await assert.rejects(

      generateTaskSummaryReport({
        id: String(userId),
        role: "invalid"
      }),

      { statusCode: 403 }

    );

    await assert.rejects(

      generateTaskSummaryReport(
        currentUser,
        "../../secret.json"
      ),

      { statusCode: 400 }

    );

    console.log("[PASS] Invalid role and unsafe file name rejected");


    // =====================================
    // TEST 10: UNIQUE REPORT FILES
    // =====================================

    console.log("\n===== TEST 10: UNIQUE REPORT FILES =====");

    const secondReport = await generateReport(
      currentUser
    );

    assert.notEqual(
      userReport.result.fileName,
      secondReport.result.fileName
    );

    assert.equal(
      new Set(generatedFiles).size,
      generatedFiles.length
    );

    console.log("[PASS] Unique report files generated");


    console.log("\n====================================");
    console.log("ALL 10 REPORT FILE TESTS PASSED");
    console.log("====================================");

  } finally {

    try {

      for (const fileName of generatedFiles) {

        await deleteFile(
          FILE_TYPES.REPORT,
          fileName
        );

      }

      console.log(
        "Generated report files removed:",
        generatedFiles.length
      );

    } finally {

      try {

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

}

runTests().catch(error => {

  console.error("[FAIL]", error);

  process.exitCode = 1;

});
