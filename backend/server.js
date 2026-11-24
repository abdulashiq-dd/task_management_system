
require("dotenv").config();

const mongoose = require("mongoose");

const app = require("./src/app");

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

    await connectDB();

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
      Export.createIndexes()
    ]);

    console.log("Notification indexes initialized");

    console.log("Task activity indexes initialized");

    console.log("Background job idempotency indexes initialized");

    console.log("Export indexes initialized");

    // 4. Initialize file storage.
    // Milestone 10: File Export and Reports.

    await initializeFileStorage();

    console.log("Export file storage initialized");

    // 5. Start Express server.

    server = app.listen(PORT, () => {

      console.log(
        `Server running on http://localhost:${PORT}`
      );

      // 6. Start reminder scheduler.
      // Milestone 7.

      startReminderJob();

      // 7. Start background worker.
      // Milestone 8: Background processing.
      // Milestone 9: Retry and failure handling.

      jobWorker.start();

    });

    server.on("error", (error) => {

      console.error(
        "HTTP server error:",
        error.message
      );

      void shutdown("SERVER_ERROR", 1);

    });

  } catch (error) {

    console.error(
      "Server startup failed:",
      error.message
    );

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

  console.log(`\n${signal} received`);

  console.log("Starting graceful shutdown...");

  // Prevent indefinite shutdown.

  const forceExitTimer = setTimeout(() => {

    console.error("Graceful shutdown timed out");

    process.exit(1);

  }, 30000);

  try {

    // 1. Stop future reminder checks.

    stopReminderJob();

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

      console.log("HTTP server stopped");

    }

    // 3. Stop job consumption and wait
    // for currently executing jobs.

    await jobWorker.stop();

    // 4. Disconnect MongoDB.

    await mongoose.disconnect();

    console.log("MongoDB disconnected");

    console.log("Graceful shutdown completed");

    process.exitCode = exitCode;

  } catch (error) {

    console.error(
      "Shutdown error:",
      error.message
    );

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
