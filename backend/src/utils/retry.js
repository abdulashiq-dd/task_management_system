const logger = require("./logger");
// ==========================================
// RETRY UTILITY
// MILESTONE 9 - RETRY AND FAILURE HANDLING
// ==========================================

// ==========================================
// 1. DELAY UTILITY
// ==========================================

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

// ==========================================
// 2. EXPONENTIAL BACKOFF
// ==========================================

function calculateBackoff(initialDelay, retryNumber) {
    return initialDelay * Math.pow(2, retryNumber - 1);
}

// ==========================================
// 3. GENERIC RETRY FUNCTION
// ==========================================

async function retry(fn, retries = 3, delay = 1000) {

    // Validate the function.

    if (typeof fn !== "function") {
        throw new TypeError(
            "Retry operation must be a function"
        );
    }

    // Validate retry configuration.

    if (!Number.isInteger(retries) || retries < 0) {
        throw new Error(
            "Retries must be a non-negative integer"
        );
    }

    // Validate initial delay.

    if (!Number.isFinite(delay) || delay < 0) {
        throw new Error(
            "Delay must be a non-negative number"
        );
    }

    const maxTimerDelay = 2147483647;

    if (
        retries > 0 &&
        calculateBackoff(delay, retries) > maxTimerDelay
    ) {
        throw new Error(
            "Retry delay exceeds supported timer range"
        );
    }

    // ======================================
    // RECURSIVE ATTEMPT FUNCTION
    // ======================================

    async function attempt(attemptNumber) {

        logger.info("[Retry] Attempt [redacted] of [redacted]");

        try {

            const result = await fn();

            logger.info("[Retry] Attempt [redacted] succeeded");

            return result;

        } catch (error) {

            logger.error("[Retry] Attempt [redacted] failed", error);

            // All retries exhausted.

            if (attemptNumber >= retries) {

                logger.error("[Retry] Maximum retry attempts exhausted");

                throw error;
            }

            // Calculate increasing retry delay.

            const nextDelay = calculateBackoff(
                delay,
                attemptNumber + 1
            );

            logger.info("[Retry] Retrying after [redacted] ms");

            await sleep(nextDelay);

            // Recursively execute the next attempt.

            return attempt(attemptNumber + 1);
        }
    }

    // Start the initial attempt.

    return attempt(0);
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    retry,
    sleep,
    calculateBackoff
};