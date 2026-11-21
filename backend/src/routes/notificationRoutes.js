
const express = require("express");

const {
  getNotifications,
  markAsRead,
  markAllAsRead,
} = require("../controllers/notificationController");

const authenticate = require("../middleware/authMiddleware");

const router = express.Router();

// All notification endpoints require authentication.
router.use(authenticate);

// Get notifications
router.get("/", getNotifications);

// Mark all as read
router.patch("/read-all", markAllAsRead);

// Mark one as read
router.patch("/:id/read", markAsRead);

module.exports = router;
