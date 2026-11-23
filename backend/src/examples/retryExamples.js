const assert = require("node:assert/strict");

const {
    retry,
    calculateBackoff
} = require("../utils/retry");

// ==========================================
// TEST 1 - IMMEDIATE SUCCESS
// ==========================================

async function testImmediateSuccess() {

    console.log("\n===== TEST 1: IMMEDIATE SUCCESS =====");

    let attempts = 0;

    const result = await retry(async () => {

        attempts++;

        return "Operation successful";

    }, 3, 100);

    assert.equal(result, "Operation successful");
    assert.equal(attempts, 1);

    console.log("[PASS] Immediate success");
}

// ==========================================
// TEST 2 - TEMPORARY FAILURE
// ==========================================

async function testTemporaryFailure() {

    console.log("\n===== TEST 2: TEMPORARY FAILURE =====");

    let attempts = 0;

    const result = await retry(async () => {

        attempts++;

        if (attempts < 3) {

            throw new Error(
                `Temporary failure ${attempts}`
            );
        }

        return "Recovered successfully";

    }, 3, 100);

    assert.equal(result, "Recovered successfully");
    assert.equal(attempts, 3);

    console.log("[PASS] Temporary failure recovered");
}

// ==========================================
// TEST 3 - PERMANENT FAILURE
// ==========================================

async function testPermanentFailure() {

    console.log("\n===== TEST 3: PERMANENT FAILURE =====");

    let attempts = 0;

    await assert.rejects(
        () => retry(async () => {

            attempts++;

            throw new Error("Permanent failure");

        }, 3, 100),

        /Permanent failure/
    );

    assert.equal(attempts, 4);

    console.log("[PASS] Maximum retries enforced");
}

// ==========================================
// TEST 4 - EXPONENTIAL BACKOFF
// ==========================================

function testExponentialBackoff() {

    console.log("\n===== TEST 4: EXPONENTIAL BACKOFF =====");

    const delays = [
        calculateBackoff(1000, 1),
        calculateBackoff(1000, 2),
        calculateBackoff(1000, 3)
    ];

    assert.deepEqual(delays, [
        1000,
        2000,
        4000
    ]);

    console.log("Retry delays:", delays);

    console.log("[PASS] Exponential backoff");
}

// ==========================================
// TEST 5 - INPUT VALIDATION
// ==========================================

async function testInputValidation() {

    console.log("\n===== TEST 5: INPUT VALIDATION =====");

    await assert.rejects(
        () => retry(null),
        /Retry operation must be a function/
    );

    await assert.rejects(
        () => retry(async () => {}, -1),
        /Retries must be a non-negative integer/
    );

    await assert.rejects(
        () => retry(async () => {}, 3, -100),
        /Delay must be a non-negative number/
    );

    console.log("[PASS] Input validation");
}

// ==========================================
// TEST 6 - ZERO RETRIES
// ==========================================

async function testZeroRetries() {

    console.log("\n===== TEST 6: ZERO RETRIES =====");

    let attempts = 0;

    await assert.rejects(
        () => retry(async () => {

            attempts++;

            throw new Error("Operation failed");

        }, 0, 100),

        /Operation failed/
    );

    assert.equal(attempts, 1);

    console.log("[PASS] Zero retries");
}

// ==========================================
// TEST 7 - INDEPENDENT RETRY CONFIGURATION
// ==========================================

async function testIndependentRetries() {

    console.log("\n===== TEST 7: INDEPENDENT RETRIES =====");

    let attemptsA = 0;
    let attemptsB = 0;

    const results = await Promise.all([

        retry(async () => {

            attemptsA++;

            if (attemptsA < 2) {
                throw new Error("Temporary failure A");
            }

            return "Operation A successful";

        }, 1, 50),

        retry(async () => {

            attemptsB++;

            if (attemptsB < 3) {
                throw new Error("Temporary failure B");
            }

            return "Operation B successful";

        }, 3, 100)
    ]);

    assert.equal(attemptsA, 2);
    assert.equal(attemptsB, 3);

    assert.deepEqual(results, [
        "Operation A successful",
        "Operation B successful"
    ]);

    console.log("[PASS] Independent retry closures");
}

// ==========================================
// RUN ALL TESTS
// ==========================================

async function runTests() {

    console.log(
        "\nMILESTONE 9 - RETRY UTILITY TESTING"
    );

    await testImmediateSuccess();

    await testTemporaryFailure();

    await testPermanentFailure();

    testExponentialBackoff();

    await testInputValidation();

    await testZeroRetries();

    await testIndependentRetries();

    console.log("\n====================================");

    console.log("ALL 7 RETRY TESTS PASSED");

    console.log("====================================");
}

runTests().catch((error) => {

    console.error("TEST FAILED:", error);

    process.exitCode = 1;
});