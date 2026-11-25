const logger = require("./src/utils/logger");

require("dotenv").config();
process.env.JOB_QUEUE_MODE = "mongo";

const mongoose = require("mongoose");
const { validateEnvironment } = require("./src/config/env");
const { acquireRuntimeLease, releaseRuntimeLease } = require("./src/config/runtimeLease");
const Task = require("./src/models/taskModel");
const User = require("./src/models/userModel");
const PasskeyChallenge = require("./src/models/passkeyChallengeModel");
const PasswordChallenge = require("./src/models/passwordChallengeModel");

const app = require("./src/app");
const { jobQueue } = require("./src/queues/jobQueue");
const { startOutbox, stopOutbox } = require("./src/events/taskOutbox");
const BackgroundJob = require("./src/models/backgroundJobModel");
const { updateExportFailure } = require("./src/services/exportJobService");

const connectDB = require("./src/config/db");

const Notification = require("./src/models/notificationModel");

const TaskActivity = require("./src/models/taskActivityModel");

const { Export } = require("./src/models/exportModel");

const {
  initializeFileStorage
} = require("./src/config/fileStorage");

const {
  startReminderJob,
  stopReminderJob
} = require("./src/jobs/reminderJob");

const {
  jobWorker
} = require("./src/workers/jobWorker");

// ==========================================
// SERVER CONFIGURATION
// ==========================================

const PORT = process.env.PORT || 5000;

let server = null;
let isShuttingDown = false;

// ==========================================
// START SERVER
// ==========================================

async function startServer() {
  try {

    // 1. Connect to MongoDB.

    try { validateEnvironment(); } catch (error) { logger.error(error.message); throw error; }
    await connectDB();
    if (process.env.NODE_ENV === "production") {
      await acquireRuntimeLease();
    } else {
      logger.info("Runtime lease disabled outside production");
    }

    // 2. Initialize database models.

    await Promise.all([
      Notification.init(),
      TaskActivity.init(),
      Export.init()
    ]);

    // 3. Create database indexes.

    await Promise.all([
      Notification.createIndexes(),
      TaskActivity.createIndexes(),
      Export.createIndexes(),
      Task.createIndexes(),
      User.createIndexes(),
      PasskeyChallenge.createIndexes(),
      PasswordChallenge.createIndexes()
    ]);

    logger.info("Notification indexes initialized");

    logger.info("Task activity indexes initialized");

    logger.info("Background job idempotency indexes initialized");

    logger.info("Export indexes initialized");

    await BackgroundJob.createIndexes();
    await jobQueue.recoverInterrupted(updateExportFailure);
    // A crash between export metadata insert and job insert can leave an orphan.
    for await (const record of Export.find({ status: { $in: ["pending", "processing", "retrying"] } }).lean().cursor()) {
      const job = await jobQueue.getJob(record.backgroundJobId);
      if (!job || job.status === "failed") await Export.updateOne({ _id: record._id, status: { $in: ["pending", "processing", "retrying"] } }, { $set: { status: "failed", error: "Export interrupted; submit again", failedAt: new Date(), completedAt: null } });
    }

    // 4. Initialize file storage.
    // Milestone 10: File Export and Reports.

    await initializeFileStorage();

    logger.info("Export file storage initialized");

    // 5. Start Express server.

    server = app.listen(PORT, () => {

      logger.info(`Server running on http://localhost:${PORT}`);

      // 6. Start reminder scheduler.
      // Milestone 7.

      if (process.env.ENABLE_REMINDER_JOB !== "false") startReminderJob();

      // 7. Start background worker.
      // Milestone 8: Background processing.
      // Milestone 9: Retry and failure handling.

      jobWorker.start();
      startOutbox();

    });

    server.on("error", (error) => {

      logger.error("HTTP server error", error);

      void shutdown("SERVER_ERROR", 1);

    });

  } catch (error) {

    logger.error("Server startup failed", error);

    await shutdown("STARTUP_ERROR", 1);

  }

}

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

async function shutdown(signal, exitCode = 0) {

  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  logger.info("\\n[redacted] received");

  logger.info("Starting graceful shutdown...");

  // Prevent indefinite shutdown.

  const forceExitTimer = setTimeout(() => {

    logger.error("Graceful shutdown timed out");

    process.exit(1);

  }, 30000);

  try {

    // 1. Stop future reminder checks.

    const reminderStopped = stopReminderJob();

    // 2. Stop accepting new HTTP requests.

    if (server && server.listening) {

      await new Promise((resolve, reject) => {

        server.close((error) => {

          if (error) {

            reject(error);

          } else {

            resolve();

          }

        });

      });

      logger.info("HTTP server stopped");

    }

    // 3. Stop job consumption and wait
    // for currently executing jobs.

    await reminderStopped;
    await stopOutbox();
    await jobWorker.stop();

    // 4. Disconnect MongoDB.

    await releaseRuntimeLease();
    await mongoose.disconnect();

    logger.info("MongoDB disconnected");

    logger.info("Graceful shutdown completed");

    process.exitCode = exitCode;

  } catch (error) {

    logger.error("Shutdown error", error);

    process.exitCode = 1;

  } finally {

    clearTimeout(forceExitTimer);

  }

}

// ==========================================
// PROCESS SIGNALS
// ==========================================

process.on("SIGINT", () => {

  void shutdown("SIGINT");

});

process.on("SIGTERM", () => {

  void shutdown("SIGTERM");

});

// ==========================================
// INITIALIZE APPLICATION
// ==========================================

startServer();
