const express = require("express");

const {
  getDashboard,
} = require("../controllers/dashboardController");

const authenticate = require("../middleware/authMiddleware");

const router = express.Router();

// All dashboard endpoints require authentication.
router.use(authenticate);

// Get dashboard statistics.
router.get("/", getDashboard);

module.exports = router;