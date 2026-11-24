
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");

async function runTests() {

  console.log("\nMILESTONE 10 - BUFFER TESTING");

  // =====================================
  // TEST 1: CREATE BUFFER
  // =====================================

  console.log("\n===== TEST 1: CREATE BUFFER =====");

  const buffer = Buffer.from("Task Management");

  console.log("Buffer:", buffer);
  console.log("Length:", buffer.length);

  assert.equal(Buffer.isBuffer(buffer), true);

  console.log("[PASS] Buffer created successfully");


  // =====================================
  // TEST 2: BUFFER TO STRING
  // =====================================

  console.log("\n===== TEST 2: BUFFER TO STRING =====");

  const text = buffer.toString("utf8");

  console.log("Converted string:", text);

  assert.equal(text, "Task Management");

  console.log("[PASS] Buffer converted to string");


  // =====================================
  // TEST 3: ALLOCATE BUFFER
  // =====================================

  console.log("\n===== TEST 3: ALLOCATE BUFFER =====");

  const allocatedBuffer = Buffer.alloc(10);

  console.log("Allocated buffer:", allocatedBuffer);

  assert.equal(allocatedBuffer.length, 10);
  assert.ok(allocatedBuffer.every(byte => byte === 0));

  console.log("[PASS] Buffer memory allocated");


  // =====================================
  // TEST 4: COMBINE BUFFERS
  // =====================================

  console.log("\n===== TEST 4: COMBINE BUFFERS =====");

  const first = Buffer.from("Task ");
  const second = Buffer.from("Report");

  const combined = Buffer.concat([
    first,
    second
  ]);

  console.log("Combined:", combined.toString());

  assert.equal(
    combined.toString(),
    "Task Report"
  );

  console.log("[PASS] Buffers combined successfully");


  // =====================================
  // TEST 5: BYTE LENGTH
  // =====================================

  console.log("\n===== TEST 5: BYTE LENGTH =====");

  const asciiText = "Task";
  const unicodeText = "Task ✅";

  console.log(
    "ASCII string length:",
    asciiText.length
  );

  console.log(
    "ASCII byte length:",
    Buffer.byteLength(asciiText, "utf8")
  );

  console.log(
    "Unicode string length:",
    unicodeText.length
  );

  console.log(
    "Unicode byte length:",
    Buffer.byteLength(unicodeText, "utf8")
  );

  assert.ok(
    Buffer.byteLength(unicodeText, "utf8") >
    unicodeText.length
  );

  console.log("[PASS] Byte length verified");


  // =====================================
  // TEST 6: BUFFER SUBARRAY
  // =====================================

  console.log("\n===== TEST 6: BUFFER SUBARRAY =====");

  const original = Buffer.from("Task Report");

  const portion = original.subarray(0, 4);

  console.log("Buffer portion:", portion.toString());

  assert.equal(portion.toString(), "Task");

  console.log("[PASS] Buffer portion extracted");


  // =====================================
  // TEST 7: FILE BUFFER OPERATIONS
  // =====================================

  console.log("\n===== TEST 7: FILE BUFFER OPERATIONS =====");

  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "buffer-test-")
  );

  const filePath = path.join(
    directory,
    "task-report.json"
  );

  try {

    const task = {
      title: "Implement File Export",
      status: "completed",
      priority: "high"
    };

    const jsonBuffer = Buffer.from(
      JSON.stringify(task, null, 2),
      "utf8"
    );

    await fs.writeFile(filePath, jsonBuffer);

    // No encoding specified, so readFile returns a Buffer.
    const fileBuffer = await fs.readFile(filePath);

    assert.equal(
      Buffer.isBuffer(fileBuffer),
      true
    );

    const parsedTask = JSON.parse(
      fileBuffer.toString("utf8")
    );

    assert.deepEqual(parsedTask, task);

    console.log("File buffer size:", fileBuffer.length);
    console.log("Parsed task:", parsedTask);

    console.log("[PASS] File buffer operations successful");

  } finally {

    await fs.rm(directory, {
      recursive: true,
      force: true
    });

    console.log("[Cleanup] Temporary files removed");

  }

  console.log("\n====================================");
  console.log("ALL 7 BUFFER TESTS PASSED");
  console.log("====================================");

}

runTests().catch((error) => {

  console.error("[FAIL]", error.message);

  process.exitCode = 1;

});
