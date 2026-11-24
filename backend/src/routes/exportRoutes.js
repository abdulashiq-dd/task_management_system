
const express = require("express");

const authenticate = require(
  "../middleware/authMiddleware"
);

const {

  exportJSON,

  exportCSV,

  listExports,

  getExport,

  downloadExport

} = require("../controllers/exportController");

const router = express.Router();

// ==========================================
// AUTHENTICATION
// ==========================================

router.use(authenticate);

// ==========================================
// CREATE EXPORT JOBS
// ==========================================

router.post("/json", exportJSON);

router.post("/csv", exportCSV);

// ==========================================
// LIST EXPORTS
// ==========================================

router.get("/", listExports);

// ==========================================
// DOWNLOAD EXPORT
// ==========================================

router.get("/:id/download", downloadExport);

// ==========================================
// GET EXPORT METADATA
// ==========================================

router.get("/:id", getExport);

module.exports = router;
