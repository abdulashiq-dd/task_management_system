
const express = require("express");

const taskRoutes = require("./routes/taskRoutes");
const authRoutes = require("./routes/authRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const jobRoutes = require("./routes/jobRoutes");
const exportRoutes = require("./routes/exportRoutes");
const reportRoutes = require("./routes/reportRoutes");
// Register task event listeners
require("./events/taskConsoleListener");

const errorHandler = require("./middleware/errorMiddleware");

const app = express();

app.use(express.json());
app.use("/api/dashboard", dashboardRoutes);
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
