const express = require("express");
const taskRoutes = require("./routes/taskRoutes");
const authRoutes = require("./routes/authRoutes");
const errorHandler = require("./middleware/errorMiddleware");
const app = express();

app.use(express.json());
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Welcome to Task Management API",
  });
});

app.use("/api/tasks",taskRoutes);
app.use("/api/auth", authRoutes);
app.use(errorHandler);
module.exports = app;
