
const {
  runReminderCheck,
} = require("../services/reminderService");

// Run every 60 seconds.
const CHECK_INTERVAL_MS = 60 * 1000;

let intervalId = null;
let isRunning = false;

// ==========================================
// 1. EXECUTE REMINDER CHECK
// ==========================================

const executeReminderCheck = async () => {
  // Prevent overlapping executions.
  if (isRunning) {
    console.log(
      "[Reminder Job] Previous check still running. Skipping."
    );
    return;
  }

  isRunning = true;

  try {
    const summary = await runReminderCheck();

    if (summary.errors.length > 0) {
      console.error(
        "[Reminder Job] Partial failures:",
        summary.errors
      );
    }
  } catch (error) {
    console.error(
      "[Reminder Job] Execution failed:",
      error.message
    );
  } finally {
    isRunning = false;
  }
};

// ==========================================
// 2. START REMINDER JOB
// ==========================================

const startReminderJob = () => {
  // Prevent multiple intervals.
  if (intervalId !== null) {
    console.log(
      "[Reminder Job] Scheduler already running."
    );
    return;
  }

  console.log(
    "[Reminder Job] Scheduler started."
  );

  console.log(
    "[Reminder Job] Checking tasks every 60 seconds."
  );

  // Execute immediately when the server starts.
  void executeReminderCheck();

  // Execute repeatedly every 60 seconds.
  intervalId = setInterval(() => {
    void executeReminderCheck();
  }, CHECK_INTERVAL_MS);
};

// ==========================================
// 3. STOP REMINDER JOB
// ==========================================

const stopReminderJob = () => {
  if (intervalId !== null) {
    clearInterval(intervalId);

    intervalId = null;

    console.log(
      "[Reminder Job] Scheduler stopped."
    );
  }
};

// ==========================================
// EXPORT FUNCTIONS
// ==========================================

module.exports = {
  startReminderJob,
  stopReminderJob,
  executeReminderCheck,
};
