
require("dotenv").config();
if (!/\/task_hardening_test_[a-f0-9]{32}(?:\?|$)/.test(process.env.MONGO_URI || "")) throw new Error("Run database tests through npm test; an isolated database is required.");
process.env.JOB_QUEUE_MODE = "mongo";

const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");

const app = require("../../src/app");
const BackgroundJob = require("../../src/models/backgroundJobModel");

const { jobWorker } = require("../../src/workers/jobWorker");

const {
  Export,
  EXPORT_STATUS,
  MIME_TYPES
} = require("../../src/models/exportModel");

const {
  FILE_TYPES,
  generateFileName,
  initializeFileStorage,
  deleteFile
} = require("../../src/config/fileStorage");

const { sleep } = require("../../src/utils/retry");

let server;
let baseUrl;
let passed = 0;

const testExportIds = new Set();

// ==========================================
// HTTP REQUEST HELPER
// ==========================================

async function request(method, path, token, body) {

  const headers = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(
    `${baseUrl}${path}`,
    {
      method,
      headers,
      body: body === undefined
        ? undefined
        : JSON.stringify(body)
    }
  );

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    status: response.status,
    headers: response.headers,
    data,
    text
  };
}

// ==========================================
// TEST RESULT HELPER
// ==========================================

async function test(name, callback) {

  console.log(`\n===== TEST ${passed + 1}: ${name} =====`);

  await callback();

  passed++;

  console.log(`[PASS] ${name}`);
}

// ==========================================
// LOGIN
// ==========================================

async function login(email, password, role) {

  const response = await request(
    "POST",
    "/api/auth/login",
    null,
    { email, password }
  );

  assert.equal(response.status, 200);
  assert.equal(response.data.user.role, role);
  assert.ok(response.data.token);

  return response.data;
}

// ==========================================
// WAIT FOR BACKGROUND JOB
// ==========================================

async function waitForJob(jobId, token) {

  const start = Date.now();

  while (Date.now() - start < 20000) {

    const response = await request(
      "GET",
      `/api/jobs/${jobId}`,
      token
    );

    assert.equal(response.status, 200);

    const job = response.data.job;

    if (job.status === "completed") {
      return job;
    }

    if (job.status === "failed") {
      throw new Error("Background export job failed");
    }

    await sleep(200);
  }

  throw new Error("Export job timed out");
}

// ==========================================
// CREATE EXPORT AND WAIT FOR COMPLETION
// ==========================================

async function createExport(path, token, body) {

  const response = await request(
    "POST",
    path,
    token,
    body
  );

  assert.equal(response.status, 202);
  assert.equal(response.data.success, true);

  const job = response.data.job;

  assert.ok(job.exportId);

  testExportIds.add(job.exportId);

  const completed = await waitForJob(
    job.id,
    token
  );

  assert.equal(completed.status, "completed");
  assert.equal(completed.result.exportId, job.exportId);

  return job.exportId;
}

// ==========================================
// MAIN TEST SUITE
// ==========================================

async function runTests() {

  console.log("\nMILESTONE 10 - COMPLETE API TESTING");

  let admin;
  let user;

  let jsonId;
  let csvId;
  let reportId;
  let userExportId;
  let pendingId;

  try {

    // Initialize isolated test server.

    await mongoose.connect(process.env.MONGO_URI);

    await BackgroundJob.createIndexes();
    await Export.init();
    await Export.createIndexes();
    await initializeFileStorage();

    await new Promise((resolve, reject) => {

      server = app.listen(0, "127.0.0.1", resolve);

      server.once("error", reject);

    });

    baseUrl = `http://127.0.0.1:${server.address().port}`;

    jobWorker.start();

    console.log("Test server started");

    // TEST 1

    await test("Administrator login", async () => {

      admin = await login(
        process.env.TEST_ADMIN_EMAIL,
        process.env.TEST_ADMIN_PASSWORD,
        "admin"
      );

    });

    // TEST 2

    await test("Regular user login", async () => {

      user = await login(
        process.env.TEST_USER_EMAIL,
        process.env.TEST_USER_PASSWORD,
        "user"
      );

    });

    // TEST 3

    await test("JSON export generation", async () => {

      jsonId = await createExport(
        "/api/exports/json",
        admin.token,
        { filters: {} }
      );

    });

    // TEST 4

    await test("CSV export generation", async () => {

      csvId = await createExport(
        "/api/exports/csv",
        admin.token,
        { filters: {} }
      );

    });

    // TEST 5

    await test("Task summary report generation", async () => {

      reportId = await createExport(
        "/api/reports/generate",
        admin.token,
        { reportType: "taskSummary" }
      );

    });

    // TEST 6

    await test("Administrator export listing", async () => {

      const res = await request(
        "GET",
        "/api/exports",
        admin.token
      );

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.exports));
      assert.ok(res.data.pagination.total >= 3);

    });

    // TEST 7

    await test("Export metadata retrieval", async () => {

      const res = await request(
        "GET",
        `/api/exports/${reportId}`,
        admin.token
      );

      assert.equal(res.status, 200);
      assert.equal(res.data.export.id, reportId);
      assert.equal(res.data.export.status, "completed");
      assert.equal(res.data.export.isDownloadable, true);
      assert.ok(res.data.export.size > 0);

    });

    // TEST 8

    await test("Export type filtering", async () => {

      const res = await request(
        "GET",
        "/api/exports?type=csv",
        admin.token
      );

      assert.equal(res.status, 200);
      assert.ok(res.data.exports.length > 0);

      for (const item of res.data.exports) {
        assert.equal(item.type, "csv");
      }

    });

    // TEST 9

    await test("Completed status filtering", async () => {

      const res = await request(
        "GET",
        "/api/exports?status=completed",
        admin.token
      );

      assert.equal(res.status, 200);
      assert.ok(res.data.exports.length > 0);

      for (const item of res.data.exports) {
        assert.equal(item.status, "completed");
      }

    });

    // TEST 10

    await test("Pagination", async () => {

      const res = await request(
        "GET",
        "/api/exports?page=1&limit=2",
        admin.token
      );

      assert.equal(res.status, 200);
      assert.equal(res.data.exports.length, 2);
      assert.equal(res.data.pagination.page, 1);
      assert.equal(res.data.pagination.limit, 2);
      assert.equal(res.data.pagination.hasNextPage, true);

    });

    // TEST 11

    await test("Invalid pagination rejected", async () => {

      const res = await request(
        "GET",
        "/api/exports?page=0&limit=2",
        admin.token
      );

      assert.equal(res.status, 400);

    });

    // TEST 12

    await test("JSON file download", async () => {

      const res = await request(
        "GET",
        `/api/exports/${jsonId}/download`,
        admin.token
      );

      assert.equal(res.status, 200);

      assert.match(
        res.headers.get("content-type"),
        /application\/json/
      );

      assert.match(
        res.headers.get("content-disposition"),
        /attachment.*\.json/i
      );

      assert.ok(Array.isArray(res.data));

      for (const task of res.data) {

        assert.ok(task.id);
        assert.ok(task.title);
        assert.ok(task.status);
        assert.ok(task.priority);

      }

    });

    // TEST 13

    await test("CSV file download", async () => {

      const res = await request(
        "GET",
        `/api/exports/${csvId}/download`,
        admin.token
      );

      assert.equal(res.status, 200);

      assert.match(
        res.headers.get("content-type"),
        /text\/csv/
      );

      assert.match(
        res.headers.get("content-disposition"),
        /attachment.*\.csv/i
      );

      assert.ok(res.text.length > 0);
      assert.ok(res.text.includes('"title"'));

    });

    // TEST 14

    await test("Task report download", async () => {

      const res = await request(
        "GET",
        `/api/exports/${reportId}/download`,
        admin.token
      );

      assert.equal(res.status, 200);

      assert.match(
        res.headers.get("content-disposition"),
        /attachment.*task-report-/i
      );

      assert.equal(res.data.reportType, "taskSummary");

      const report = res.data;

      const expectedRate = report.totalTasks === 0
        ? 0
        : Number(
            (
              report.completedTasks /
              report.totalTasks * 100
            ).toFixed(2)
          );

      assert.equal(
        report.completionRate,
        expectedRate
      );

      const priority = report.tasksByPriority;

      assert.equal(
        priority.low +
        priority.medium +
        priority.high,
        report.totalTasks
      );

    });

    // TEST 15

    await test("Regular user export generation", async () => {

      userExportId = await createExport(
        "/api/exports/json",
        user.token,
        { filters: {} }
      );

    });

    // TEST 16

    await test("Regular user export ownership", async () => {

      const res = await request(
        "GET",
        "/api/exports",
        user.token
      );

      assert.equal(res.status, 200);
      assert.ok(res.data.exports.length > 0);

      for (const item of res.data.exports) {
        assert.equal(item.userId, user.user.id);
      }

    });

    // TEST 17

    await test("Regular user downloads own export", async () => {

      const res = await request(
        "GET",
        `/api/exports/${userExportId}/download`,
        user.token
      );

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data));

      // Verify no unauthorized tasks were exported.

      for (const task of res.data) {

        assert.ok(
          task.createdBy === user.user.id ||
          task.assignedTo === user.user.id
        );

      }

    });

    // TEST 18

    await test("Unauthorized metadata access blocked", async () => {

      const res = await request(
        "GET",
        `/api/exports/${reportId}`,
        user.token
      );

      assert.equal(res.status, 404);
      assert.equal(res.data.message, "Export not found");

    });

    // TEST 19

    await test("Unauthorized file download blocked", async () => {

      const res = await request(
        "GET",
        `/api/exports/${reportId}/download`,
        user.token
      );

      assert.equal(res.status, 404);

      assert.equal(
        res.headers.has("content-disposition"),
        false
      );

    });

    // TEST 20

    await test("Administrator downloads another user's export", async () => {

      const res = await request(
        "GET",
        `/api/exports/${userExportId}/download`,
        admin.token
      );

      assert.equal(res.status, 200);

      assert.match(
        res.headers.get("content-disposition"),
        /attachment/
      );

    });

    // TEST 21

    await test("Invalid export filter rejected", async () => {

      const res = await request(
        "POST",
        "/api/exports/json",
        admin.token,
        {
          filters: {
            status: "invalid_status"
          }
        }
      );

      assert.equal(res.status, 400);

    });

    // TEST 22

    await test("Invalid report type rejected", async () => {

      const res = await request(
        "POST",
        "/api/reports/generate",
        admin.token,
        {
          reportType: "invalidReport"
        }
      );

      assert.equal(res.status, 400);

    });

    // TEST 23

    await test("Unauthenticated export rejected", async () => {

      const res = await request(
        "POST",
        "/api/exports/csv",
        null,
        { filters: {} }
      );

      assert.equal(res.status, 401);

    });

    // TEST 24

    await test("Unauthenticated download rejected", async () => {

      const res = await request(
        "GET",
        `/api/exports/${jsonId}/download`
      );

      assert.equal(res.status, 401);

    });

    // TEST 25

    await test("Invalid export ID rejected", async () => {

      const res = await request(
        "GET",
        "/api/exports/invalid-id",
        admin.token
      );

      assert.equal(res.status, 400);

    });

    // TEST 26

    await test("Nonexistent export rejected", async () => {

      const missingId =
        new mongoose.Types.ObjectId();

      const res = await request(
        "GET",
        `/api/exports/${missingId}`,
        admin.token
      );

      assert.equal(res.status, 404);

    });

    // TEST 27

    await test("Incomplete export download blocked", async () => {

      // Create a controlled pending record.
      // Do not enqueue it.

      const record = await Export.create({

        userId: user.user.id,

        backgroundJobId: randomUUID(),

        type: FILE_TYPES.JSON,

        fileName: generateFileName(FILE_TYPES.JSON),

        mimeType: MIME_TYPES[FILE_TYPES.JSON],

        status: EXPORT_STATUS.PENDING,

        filters: {}

      });

      pendingId = String(record._id);

      testExportIds.add(pendingId);

      const res = await request(
        "GET",
        `/api/exports/${pendingId}/download`,
        user.token
      );

      assert.equal(res.status, 409);

      assert.equal(
        res.headers.has("content-disposition"),
        false
      );

    });

    // TEST 28

    await test("Incomplete export metadata verified", async () => {

      const res = await request(
        "GET",
        `/api/exports/${pendingId}`,
        user.token
      );

      assert.equal(res.status, 200);
      assert.equal(res.data.export.status, "pending");
      assert.equal(res.data.export.isDownloadable, false);
      assert.equal(res.data.export.downloadUrl, null);

    });

    console.log("\n====================================");
    console.log(`ALL ${passed} EXPORT API TESTS PASSED`);
    console.log("====================================");

  } finally {

    // Stop test server.

    if (server?.listening) {

      await new Promise(resolve => {
        server.close(resolve);
      });

    }

    await jobWorker.stop();

    try {

      // Remove only records created by this test.
      // Existing tasks, users and exports are preserved.

      if (mongoose.connection.readyState === 1) {

        const records = await Export.find({
          _id: {
            $in: Array.from(testExportIds)
          }
        });

        await BackgroundJob.deleteMany({ id: { $in: records.map(record => record.backgroundJobId) } });
        let filesRemoved = 0;

        for (const record of records) {

          const removed = await deleteFile(
            record.type,
            record.fileName
          );

          if (removed) {
            filesRemoved++;
          }

        }

        const result = await Export.deleteMany({
          _id: {
            $in: Array.from(testExportIds)
          }
        });

        console.log(
          "Temporary files removed:",
          filesRemoved
        );

        console.log(
          "Temporary export records removed:",
          result.deletedCount
        );

      }

    } finally {

      await mongoose.disconnect();

      console.log("MongoDB disconnected");
      console.log("Test server stopped");

    }

  }

}

runTests().catch(error => {

  console.error("\n[FAIL]", error.message);

  console.log(`Tests passed before failure: ${passed}/28`);

  process.exitCode = 1;

});
