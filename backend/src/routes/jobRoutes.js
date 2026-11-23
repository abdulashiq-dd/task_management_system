
const express = require("express");

const {
  getJobs,
  getJobById,
  getJobStats,
} = require("../controllers/jobController");

const authenticate = require(
  "../middleware/authMiddleware"
);

const router = express.Router();

// ==========================================
// AUTHENTICATION
// ==========================================

router.use(authenticate);

// ==========================================
// JOB ROUTES
// ==========================================

// GET /api/jobs
router.get("/", getJobs);

// GET /api/jobs/stats
router.get("/stats", getJobStats);

// GET /api/jobs/:id
router.get("/:id", getJobById);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
