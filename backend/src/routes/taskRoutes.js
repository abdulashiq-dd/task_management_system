const express = require("express");

const router = express.Router();

const {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  assignTask
} = require("../controllers/taskController");
const authenticate = require("../middleware/authMiddleware");
router.use(authenticate);
router.post("/", createTask);
router.get("/", getAllTasks);
router.get("/:id",getTaskById);
router.patch("/:id",updateTask);
router.delete("/:id",deleteTask);
router.patch("/:id/assign", assignTask);
module.exports = router;
