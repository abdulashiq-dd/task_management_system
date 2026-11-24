
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");

async function runTests() {

  console.log("\nMILESTONE 10 - FILESYSTEM API TESTING");

  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "task-management-")
  );

  const filePath = path.join(directory, "tasks.json");
  const renamedPath = path.join(directory, "tasks-report.json");

  const tasks = [
    {
      id: 1,
      title: "Develop REST API",
      status: "completed",
      priority: "high"
    },
    {
      id: 2,
      title: "Implement File Export",
      status: "in_progress",
      priority: "high"
    },
    {
      id: 3,
      title: "Test Download API",
      status: "pending",
      priority: "medium"
    }
  ];

  try {

    // =====================================
    // TEST 1: CREATE DIRECTORY
    // =====================================

    console.log("\n===== TEST 1: CREATE DIRECTORY =====");

    await fs.mkdir(directory, {
      recursive: true
    });

    const directoryInfo = await fs.stat(directory);

    assert.equal(directoryInfo.isDirectory(), true);

    console.log("[PASS] Directory created successfully");


    // =====================================
    // TEST 2: WRITE JSON FILE
    // =====================================

    console.log("\n===== TEST 2: WRITE JSON FILE =====");

    await fs.writeFile(
      filePath,
      JSON.stringify(tasks, null, 2),
      "utf8"
    );

    const fileInfo = await fs.stat(filePath);

    assert.equal(fileInfo.isFile(), true);
    assert.ok(fileInfo.size > 0);

    console.log("[PASS] JSON file written successfully");


    // =====================================
    // TEST 3: READ JSON FILE
    // =====================================

    console.log("\n===== TEST 3: READ JSON FILE =====");

    const content = await fs.readFile(filePath, "utf8");

    const parsedTasks = JSON.parse(content);

    assert.deepEqual(parsedTasks, tasks);

    console.log("Tasks:", parsedTasks);
    console.log("[PASS] JSON file read successfully");


    // =====================================
    // TEST 4: FILE METADATA
    // =====================================

    console.log("\n===== TEST 4: FILE METADATA =====");

    const stats = await fs.stat(filePath);

    console.log("File size:", stats.size, "bytes");
    console.log("Created at:", stats.birthtime);
    console.log("Modified at:", stats.mtime);

    assert.ok(stats.size > 0);

    console.log("[PASS] File metadata retrieved");


    // =====================================
    // TEST 5: RENAME FILE
    // =====================================

    console.log("\n===== TEST 5: RENAME FILE =====");

    await fs.rename(filePath, renamedPath);

    await fs.access(renamedPath);

    await assert.rejects(
      fs.access(filePath),
      { code: "ENOENT" }
    );

    console.log("[PASS] File renamed successfully");


    // =====================================
    // TEST 6: MISSING FILE ERROR
    // =====================================

    console.log("\n===== TEST 6: MISSING FILE ERROR =====");

    const missingPath = path.join(
      directory,
      "missing.json"
    );

    await assert.rejects(
      fs.readFile(missingPath, "utf8"),
      { code: "ENOENT" }
    );

    console.log("[PASS] Missing file error handled");


    // =====================================
    // TEST 7: DELETE FILE
    // =====================================

    console.log("\n===== TEST 7: DELETE FILE =====");

    await fs.unlink(renamedPath);

    await assert.rejects(
      fs.access(renamedPath),
      { code: "ENOENT" }
    );

    console.log("[PASS] File deleted successfully");


    console.log("\n====================================");
    console.log("ALL 7 FILESYSTEM TESTS PASSED");
    console.log("====================================");

  } finally {

    await fs.rm(directory, {
      recursive: true,
      force: true
    });

    console.log("[Cleanup] Temporary files removed");

  }
}

runTests().catch((error) => {

  console.error("[FAIL]", error.message);

  process.exitCode = 1;

});
