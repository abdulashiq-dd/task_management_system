
const express = require("express");

const taskRoutes = require("./routes/taskRoutes");
const authRoutes = require("./routes/authRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
// Register task event listeners
require("./events/taskActivityListener");
require("./events/taskConsoleListener");
require("./events/taskNotificationListener");

const errorHandler = require("./middleware/errorMiddleware");

const app = express();

app.use(express.json());
app.use("/api/dashboard", dashboardRoutes);
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
