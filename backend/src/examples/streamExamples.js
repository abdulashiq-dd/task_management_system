
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");

const {
  Readable,
  Writable,
  Transform
} = require("node:stream");

const {
  pipeline
} = require("node:stream/promises");

const {
  once
} = require("node:events");

async function runTests() {

  console.log("\nMILESTONE 10 - STREAM TESTING");

  const directory = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), "stream-test-")
  );

  const sourceFile = path.join(directory, "source.txt");
  const destinationFile = path.join(directory, "destination.txt");
  const transformedFile = path.join(directory, "transformed.txt");
  const largeFile = path.join(directory, "large.csv");

  try {

    // =====================================
    // TEST 1: READABLE STREAM
    // =====================================

    console.log("\n===== TEST 1: READABLE STREAM =====");

    const content =
      "Task Management System\n" +
      "File Export and Reports\n" +
      "Learning Node.js Streams";

    await fsPromises.writeFile(
      sourceFile,
      content,
      "utf8"
    );

    const readStream = fs.createReadStream(
      sourceFile,
      {
        encoding: "utf8",
        highWaterMark: 16
      }
    );

    let collectedData = "";
    let chunks = 0;

    for await (const chunk of readStream) {

      chunks++;

      collectedData += chunk;

      console.log(`Chunk ${chunks}:`, chunk);

    }

    assert.equal(collectedData, content);
    assert.ok(chunks > 1);

    console.log("Total chunks:", chunks);
    console.log("[PASS] File read using streams");


    // =====================================
    // TEST 2: WRITABLE STREAM
    // =====================================

    console.log("\n===== TEST 2: WRITABLE STREAM =====");

    const taskRows = [
      "id,title,status\n",
      "1,Develop API,completed\n",
      "2,File Export,in_progress\n",
      "3,Test Reports,pending\n"
    ];

    await pipeline(
      Readable.from(taskRows),
      fs.createWriteStream(destinationFile)
    );

    const writtenContent =
      await fsPromises.readFile(
        destinationFile,
        "utf8"
      );

    assert.equal(
      writtenContent,
      taskRows.join("")
    );

    console.log(writtenContent);

    console.log("[PASS] File written using streams");


    // =====================================
    // TEST 3: PIPELINE
    // =====================================

    console.log("\n===== TEST 3: PIPELINE =====");

    await pipeline(
      fs.createReadStream(sourceFile),
      fs.createWriteStream(destinationFile)
    );

    const copiedContent =
      await fsPromises.readFile(
        destinationFile,
        "utf8"
      );

    assert.equal(copiedContent, content);

    console.log("[PASS] File copied using pipeline");


    // =====================================
    // TEST 4: TRANSFORM STREAM
    // =====================================

    console.log("\n===== TEST 4: TRANSFORM STREAM =====");

    const uppercaseTransform = new Transform({

      transform(chunk, encoding, callback) {

        const result = chunk
          .toString()
          .toUpperCase();

        callback(null, result);

      }

    });

    await pipeline(
      fs.createReadStream(sourceFile),
      uppercaseTransform,
      fs.createWriteStream(transformedFile)
    );

    const transformedContent =
      await fsPromises.readFile(
        transformedFile,
        "utf8"
      );

    assert.equal(
      transformedContent,
      content.toUpperCase()
    );

    console.log(transformedContent);

    console.log("[PASS] Transform stream successful");


    // =====================================
    // TEST 5: BACKPRESSURE
    // =====================================

    console.log("\n===== TEST 5: BACKPRESSURE =====");

    let processedChunks = 0;
    let backpressureCount = 0;

    const slowWritable = new Writable({

      highWaterMark: 16,

      write(chunk, encoding, callback) {

        setTimeout(() => {

          processedChunks++;

          callback();

        }, 10);

      }

    });

    for (let i = 0; i < 20; i++) {

      const chunk = Buffer.alloc(8, "A");

      const canContinue =
        slowWritable.write(chunk);

      if (!canContinue) {

        backpressureCount++;

        console.log(
          "Backpressure detected. Waiting for drain..."
        );

        await once(slowWritable, "drain");

      }

    }

    const finished = once(
      slowWritable,
      "finish"
    );

    slowWritable.end();

    await finished;

    assert.equal(processedChunks, 20);
    assert.ok(backpressureCount > 0);

    console.log(
      "Processed chunks:",
      processedChunks
    );

    console.log(
      "Backpressure events:",
      backpressureCount
    );

    console.log("[PASS] Backpressure handled");


    // =====================================
    // TEST 6: LARGE FILE GENERATION
    // =====================================

    console.log("\n===== TEST 6: LARGE FILE GENERATION =====");

    const totalTasks = 100000;

    async function* generateTasks() {

      yield "id,title,status,priority\n";

      for (let i = 1; i <= totalTasks; i++) {

        yield `${i},Task ${i},pending,medium\n`;

      }

    }

    await pipeline(
      Readable.from(generateTasks()),
      fs.createWriteStream(largeFile)
    );

    const fileStats =
      await fsPromises.stat(largeFile);

    let newlineCount = 0;

    for await (
      const chunk of fs.createReadStream(largeFile)
    ) {

      for (const byte of chunk) {

        if (byte === 10) {
          newlineCount++;
        }

      }

    }

    assert.equal(
      newlineCount,
      totalTasks + 1
    );

    assert.ok(fileStats.size > 0);

    console.log(
      "Generated tasks:",
      totalTasks
    );

    console.log(
      "File size:",
      fileStats.size,
      "bytes"
    );

    console.log(
      "Verified lines:",
      newlineCount
    );

    console.log(
      "[PASS] Large file generated incrementally"
    );


    // =====================================
    // TEST 7: STREAM ERROR HANDLING
    // =====================================

    console.log("\n===== TEST 7: STREAM ERROR HANDLING =====");

    const missingFile = path.join(
      directory,
      "missing.txt"
    );

    const errorDestination = path.join(
      directory,
      "error-output.txt"
    );

    await assert.rejects(

      pipeline(
        fs.createReadStream(missingFile),
        fs.createWriteStream(errorDestination)
      ),

      {
        code: "ENOENT"
      }

    );

    console.log("[PASS] Stream errors handled");


    // =====================================
    // TEST 8: BUFFER CHUNKS
    // =====================================

    console.log("\n===== TEST 8: BUFFER CHUNKS =====");

    let totalBytes = 0;
    let bufferChunks = 0;

    const binaryStream =
      fs.createReadStream(sourceFile, {

        highWaterMark: 8

      });

    for await (const chunk of binaryStream) {

      assert.equal(
        Buffer.isBuffer(chunk),
        true
      );

      bufferChunks++;

      totalBytes += chunk.length;

    }

    assert.equal(
      totalBytes,
      Buffer.byteLength(content)
    );

    console.log("Buffer chunks:", bufferChunks);
    console.log("Total bytes:", totalBytes);

    console.log("[PASS] Binary stream chunks verified");


    console.log("\n====================================");
    console.log("ALL 8 STREAM TESTS PASSED");
    console.log("====================================");

  } finally {

    await fsPromises.rm(directory, {
      recursive: true,
      force: true
    });

    console.log(
      "[Cleanup] Temporary files removed"
    );

  }

}

runTests().catch((error) => {

  console.error("[FAIL]", error.message);

  process.exitCode = 1;

});
