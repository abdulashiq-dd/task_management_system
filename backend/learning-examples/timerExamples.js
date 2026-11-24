
const { performance } = require("node:perf_hooks");

const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ==========================================
// 1. SET TIMEOUT
// ==========================================

async function testSetTimeout() {
  console.log("\n--- setTimeout() ---");

  console.log("Timer scheduled");

  await new Promise((resolve) => {
    setTimeout(() => {
      console.log("Callback executed after 1 second");
      resolve();
    }, 1000);
  });
}

// ==========================================
// 2. SET INTERVAL
// ==========================================

async function testSetInterval() {
  console.log("\n--- setInterval() ---");

  await new Promise((resolve) => {
    let count = 0;

    const interval = setInterval(() => {
      count++;

      console.log(`Interval executed: ${count}`);

      if (count === 3) {
        clearInterval(interval);

        console.log("Interval stopped");
        resolve();
      }
    }, 1000);
  });
}

// ==========================================
// 3. CLEAR TIMEOUT
// ==========================================

async function testClearTimeout() {
  console.log("\n--- clearTimeout() ---");

  const timer = setTimeout(() => {
    console.log("This message should not appear");
  }, 1000);

  clearTimeout(timer);

  await delay(1200);

  console.log("Timeout cancelled successfully");
}

// ==========================================
// 4. EVENT LOOP BLOCKING
// ==========================================

async function testEventLoopBlocking() {
  console.log("\n--- Event Loop Blocking ---");

  const start = performance.now();

  const timerCompleted = new Promise((resolve) => {
    setTimeout(() => {
      const elapsed = performance.now() - start;

      console.log("Expected delay: 1000 ms");
      console.log(`Actual delay: ${elapsed.toFixed(0)} ms`);

      resolve();
    }, 1000);
  });

  console.log("Blocking event loop for 3 seconds");

  // Intentionally blocking for demonstration only.
  while (performance.now() - start < 3000) {
    // Simulate CPU-intensive synchronous work.
  }

  console.log("Event loop unblocked");

  await timerCompleted;
}

// ==========================================
// 5. ASYNC FUNCTIONS INSIDE TIMERS
// ==========================================

async function testAsyncTimer() {
  console.log("\n--- Async Timer Callback ---");

  await new Promise((resolve) => {
    setTimeout(async () => {
      try {
        console.log("Async operation started");

        await delay(1000);

        console.log("Async operation completed");
      } catch (error) {
        console.error(error.message);
      } finally {
        resolve();
      }
    }, 500);
  });
}

// ==========================================
// 6. PREVENT OVERLAPPING EXECUTIONS
// ==========================================

async function testOverlapPrevention() {
  console.log("\n--- Prevent Overlapping Timers ---");

  let isRunning = false;
  let completed = 0;

  await new Promise((resolve) => {
    const interval = setInterval(async () => {
      if (isRunning) {
        console.log("Previous execution running. Skipped.");
        return;
      }

      isRunning = true;

      try {
        console.log("Background check started");

        // Simulate a slow database operation.
        await delay(2500);

        completed++;

        console.log("Background check completed");
      } catch (error) {
        console.error(error.message);
      } finally {
        isRunning = false;

        if (completed === 2) {
          clearInterval(interval);

          console.log("Background scheduler stopped");
          resolve();
        }
      }
    }, 1000);
  });
}

// ==========================================
// RUN ALL EXAMPLES
// ==========================================

async function main() {
  await testSetTimeout();
  await testSetInterval();
  await testClearTimeout();
  await testEventLoopBlocking();
  await testAsyncTimer();
  await testOverlapPrevention();

  console.log("\nAll timer examples completed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
