
const logger = require("../utils/logger");
const {
  runReminderCheck,
} = require("../services/reminderService");

// Run every 60 seconds.
const CHECK_INTERVAL_MS = 60 * 1000;

let intervalId = null;
let isRunning = false;
let activeCheck = null;

// ==========================================
// 1. EXECUTE REMINDER CHECK
// ==========================================

const runCheck = async () => {
  // Prevent overlapping executions.
  if (isRunning) {
    logger.info("[Reminder Job] Previous check still running. Skipping.");
    return;
  }

  isRunning = true;

  try {
    const summary = await runReminderCheck();

    if (summary.errors.length > 0) {
      logger.error("[Reminder Job] Partial failures");
    }
  } catch (error) {
    logger.error("Reminder execution failed", error);
  } finally {
    isRunning = false;
  }
};

function executeReminderCheck() {
  if (!activeCheck) activeCheck = runCheck().finally(() => { activeCheck = null; });
  return activeCheck;
}

// ==========================================
// 2. START REMINDER JOB
// ==========================================

const startReminderJob = () => {
  // Prevent multiple intervals.
  if (intervalId !== null) {
    logger.info("[Reminder Job] Scheduler already running.");
    return;
  }

  logger.info("[Reminder Job] Scheduler started.");

  logger.info("[Reminder Job] Checking tasks every 60 seconds.");

  // Execute immediately when the server starts.
  void executeReminderCheck();

  // Execute repeatedly every 60 seconds.
  intervalId = setInterval(() => {
    void executeReminderCheck();
  }, CHECK_INTERVAL_MS);
  intervalId.unref();
};

// ==========================================
// 3. STOP REMINDER JOB
// ==========================================

const stopReminderJob = async () => {
  if (intervalId !== null) {
    clearInterval(intervalId);

    intervalId = null;

    logger.info("[Reminder Job] Scheduler stopped.");
  }
  await activeCheck;
};

// ==========================================
// EXPORT FUNCTIONS
// ==========================================

module.exports = {
  startReminderJob,
  stopReminderJob,
  executeReminderCheck,
};
