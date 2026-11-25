
const express = require("express");

const taskRoutes = require("./routes/taskRoutes");
const authRoutes = require("./routes/authRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const activityRoutes = require("./routes/activityRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const jobRoutes = require("./routes/jobRoutes");
const exportRoutes = require("./routes/exportRoutes");
const reportRoutes = require("./routes/reportRoutes");
// Register task event listeners
require("./events/taskConsoleListener");

const errorHandler = require("./middleware/errorMiddleware");

const app = express();

if (process.env.NODE_ENV === "production") {
  const configuredProxy = process.env.TRUST_PROXY?.trim();
  if (configuredProxy) {
    app.set(
      "trust proxy",
      /^\d+$/.test(configuredProxy)
        ? Number(configuredProxy)
        : configuredProxy.split(",").map(value => value.trim()).filter(Boolean)
    );
  }

  app.use((req, res, next) => {
    if (!req.secure) {
      return res.status(400).json({ message: "HTTPS is required" });
    }
    return next();
  });
}

app.use(express.json());
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/exports", exportRoutes);
app.use("/api/reports", reportRoutes);
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Welcome to Task Management API",
  });
});

app.use("/api/tasks", taskRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/notifications", notificationRoutes);

app.use(errorHandler);

module.exports = app;
