
const delay = (ms, value, shouldFail = false) =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        reject(new Error(`${value} failed`));
      } else {
        resolve(value);
      }
    }, ms);
  });

// 1. Sequential vs Concurrent
async function testExecution() {
  console.log("\n--- Sequential Execution ---");

  console.time("Sequential");

  await delay(1000, "Total Tasks");
  await delay(1000, "Completed Tasks");
  await delay(1000, "Pending Tasks");

  console.timeEnd("Sequential");

  console.log("\n--- Concurrent Execution ---");

  console.time("Concurrent");

  await Promise.all([
    delay(1000, "Total Tasks"),
    delay(1000, "Completed Tasks"),
    delay(1000, "Pending Tasks"),
  ]);

  console.timeEnd("Concurrent");
}

// 2. Promise.all — Fails Fast
async function testPromiseAll() {
  console.log("\n--- Promise.all ---");

  try {
    const result = await Promise.all([
      delay(500, "Total Tasks"),
      delay(200, "Completed Tasks", true),
      delay(800, "Pending Tasks"),
    ]);

    console.log(result);
  } catch (error) {
    console.log("Promise.all rejected:", error.message);
  }
}

// 3. Promise.allSettled — Partial Results
async function testAllSettled() {
  console.log("\n--- Promise.allSettled ---");

  const result = await Promise.allSettled([
    delay(500, "Total Tasks"),
    delay(200, "Completed Tasks", true),
    delay(800, "Pending Tasks"),
  ]);

  console.log(result);
}

// 4. Promise.race — Timeout
async function testRace() {
  console.log("\n--- Promise.race ---");

  try {
    const result = await Promise.race([
      delay(2000, "Dashboard Data"),
      delay(1000, "Request timeout", true),
    ]);

    console.log(result);
  } catch (error) {
    console.log("Timeout:", error.message);
  }
}

// 5. Promise.any — First Success
async function testAny() {
  console.log("\n--- Promise.any ---");

  try {
    const result = await Promise.any([
      delay(200, "Provider A", true),
      delay(500, "Provider B"),
      delay(1000, "Provider C"),
    ]);

    console.log("First successful provider:", result);
  } catch (error) {
    console.log("All providers failed:", error.message);
  }
}

async function main() {
  await testExecution();
  await testPromiseAll();
  await testAllSettled();
  await testRace();
  await testAny();
}

main().catch(console.error);
