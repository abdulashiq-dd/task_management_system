
const express = require("express");

const {
  generateReport,
} = require("../controllers/reportController");

const authenticate = require(
  "../middleware/authMiddleware"
);

const router = express.Router();

// ==========================================
// AUTHENTICATION
// ==========================================

router.use(authenticate);

// ==========================================
// REPORT ROUTES
// ==========================================

// POST /api/reports/generate
router.post("/generate", generateReport);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
