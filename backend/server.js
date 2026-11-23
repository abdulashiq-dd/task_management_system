
require("dotenv").config();

const mongoose = require("mongoose");
const app = require("./src/app");
const connectDB = require("./src/config/db");

const Notification = require("./src/models/notificationModel");

const {
  startReminderJob,
  stopReminderJob,
} = require("./src/jobs/reminderJob");

const PORT = process.env.PORT || 5000;

let server;

// ==========================================
// START SERVER
// ==========================================

const startServer = async () => {
  try {
    // Connect to MongoDB.
    await connectDB();

    // Initialize notification model and indexes.
    await Notification.init();

    // Ensure declared indexes exist.
    await Notification.createIndexes();

    console.log("Notification indexes initialized");

    // Start Express server.
    server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);

      // Start background reminder scheduler.
      startReminderJob();
    });

  } catch (error) {
    console.error("Unable to start server:", error.message);
    process.exit(1);
  }
};

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

const shutdown = async (signal) => {
  console.log(`\n${signal} received`);

  // Stop future reminder checks.
  stopReminderJob();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    await mongoose.disconnect();

    console.log("MongoDB disconnected");
    console.log("Server stopped successfully");

    process.exit(0);

  } catch (error) {
    console.error("Shutdown error:", error.message);
    process.exit(1);
  }
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

// Start application.
startServer();
