
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");

const {
  FILE_TYPES,
  STORAGE_DIRECTORIES,
  initializeFileStorage,
  generateFileName,
  getFilePath,
  createFileLocation,
  fileExists,
  getFileMetadata,
  deleteFile
} = require("../config/fileStorage");

async function runTests() {

  console.log("\nMILESTONE 10 - FILE STORAGE TESTING");

  let testLocation;

  try {

    // =====================================
    // TEST 1: DIRECTORY INITIALIZATION
    // =====================================

    console.log("\n===== TEST 1: INITIALIZE STORAGE =====");

    await initializeFileStorage();

    for (
      const directory of Object.values(STORAGE_DIRECTORIES)
    ) {

      const stats = await fs.stat(directory);

      assert.equal(stats.isDirectory(), true);

      console.log("Directory:", directory);

    }

    console.log("[PASS] All storage directories initialized");


    // =====================================
    // TEST 2: UNIQUE FILE NAMES
    // =====================================

    console.log("\n===== TEST 2: UNIQUE FILE NAMES =====");

    const names = new Set();

    for (let i = 0; i < 1000; i++) {

      names.add(
        generateFileName(FILE_TYPES.JSON)
      );

    }

    assert.equal(names.size, 1000);

    console.log("Generated unique names:", names.size);

    console.log("[PASS] Unique file names generated");


    // =====================================
    // TEST 3: FILE EXTENSIONS
    // =====================================

    console.log("\n===== TEST 3: FILE EXTENSIONS =====");

    assert.equal(

      path.extname(
        generateFileName(FILE_TYPES.JSON)
      ),

      ".json"

    );

    assert.equal(

      path.extname(
        generateFileName(FILE_TYPES.CSV)
      ),

      ".csv"

    );

    assert.equal(

      path.extname(
        generateFileName(FILE_TYPES.REPORT)
      ),

      ".json"

    );

    console.log("[PASS] File extensions verified");


    // =====================================
    // TEST 4: SAFE FILE PATH
    // =====================================

    console.log("\n===== TEST 4: SAFE FILE PATH =====");

    testLocation = createFileLocation(
      FILE_TYPES.JSON
    );

    assert.equal(

      path.dirname(testLocation.filePath),

      STORAGE_DIRECTORIES[FILE_TYPES.JSON]

    );

    console.log("File location:", testLocation);

    console.log("[PASS] Safe file path generated");


    // =====================================
    // TEST 5: PATH TRAVERSAL PROTECTION
    // =====================================

    console.log("\n===== TEST 5: PATH TRAVERSAL =====");

    const maliciousNames = [

      "../secret.json",

      "../../secret.json",

      "..\\..\\secret.json",

      "C:\\Windows\\secret.json",

      "/etc/secret.json",

      "%2e%2e%2fsecret.json",

      "tasks.json.exe",

      "invalid/file.json",

      ".env"

    ];

    for (const fileName of maliciousNames) {

      assert.throws(

        () => getFilePath(
          FILE_TYPES.JSON,
          fileName
        ),

        { statusCode: 400 }

      );

      console.log("Blocked:", fileName);

    }

    console.log("[PASS] Unsafe file paths blocked");


    // =====================================
    // TEST 6: INVALID FILE TYPE
    // =====================================

    console.log("\n===== TEST 6: INVALID FILE TYPE =====");

    assert.throws(

      () => generateFileName("invalid"),

      { statusCode: 400 }

    );

    assert.throws(

      () => generateFileName("constructor"),

      { statusCode: 400 }

    );

    console.log("[PASS] Invalid file types rejected");


    // =====================================
    // TEST 7: FILE EXISTENCE
    // =====================================

    console.log("\n===== TEST 7: FILE EXISTENCE =====");

    assert.equal(

      await fileExists(
        testLocation.type,
        testLocation.fileName
      ),

      false

    );

    const content = JSON.stringify({
      title: "File Storage Test",
      status: "completed"
    });

    await fs.writeFile(
      testLocation.filePath,
      content,
      {
        encoding: "utf8",
        flag: "wx"
      }
    );

    assert.equal(

      await fileExists(
        testLocation.type,
        testLocation.fileName
      ),

      true

    );

    console.log("[PASS] File existence verified");


    // =====================================
    // TEST 8: FILE METADATA
    // =====================================

    console.log("\n===== TEST 8: FILE METADATA =====");

    const metadata = await getFileMetadata(
      testLocation.type,
      testLocation.fileName
    );

    assert.equal(
      metadata.size,
      Buffer.byteLength(content)
    );

    assert.equal(
      metadata.extension,
      ".json"
    );

    console.log("Metadata:", metadata);

    console.log("[PASS] File metadata verified");


    // =====================================
    // TEST 9: FILE DELETION
    // =====================================

    console.log("\n===== TEST 9: FILE DELETION =====");

    const deleted = await deleteFile(
      testLocation.type,
      testLocation.fileName
    );

    assert.equal(deleted, true);

    assert.equal(

      await fileExists(
        testLocation.type,
        testLocation.fileName
      ),

      false

    );

    console.log("[PASS] File deleted successfully");


    // =====================================
    // TEST 10: MISSING FILE HANDLING
    // =====================================

    console.log("\n===== TEST 10: MISSING FILE =====");

    const result = await deleteFile(
      testLocation.type,
      testLocation.fileName
    );

    assert.equal(result, false);

    await assert.rejects(

      getFileMetadata(
        testLocation.type,
        testLocation.fileName
      ),

      { code: "ENOENT" }

    );

    console.log("[PASS] Missing file handled safely");


    console.log("\n====================================");
    console.log("ALL 10 FILE STORAGE TESTS PASSED");
    console.log("====================================");

  } finally {

    if (testLocation) {

      await deleteFile(
        testLocation.type,
        testLocation.fileName
      );

    }

    console.log("[Cleanup] Test file removed");

  }

}

runTests().catch(error => {

  console.error("[FAIL]", error.message);

  process.exitCode = 1;

});
