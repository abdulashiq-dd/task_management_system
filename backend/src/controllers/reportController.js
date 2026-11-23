
const reportService = require(
  "../services/reportService"
);

// ==========================================
// GENERATE REPORT
// POST /api/reports/generate
// ==========================================

function generateReport(req, res) {
  try {
    const currentUser = {
      id: req.user.id,
      role: req.user.role,
    };

    // Submit the job without waiting
    // for report generation to complete.
    const job = reportService.generateReport(
      req.body,
      currentUser
    );

    return res
      .location(`/api/jobs/${job.id}`)
      .status(202)
      .json({
        success: true,
        message:
          "Report generation job queued successfully",
        job,
        statusUrl: `/api/jobs/${job.id}`,
      });
  } catch (error) {
    const statusCode = error.statusCode || 500;

    console.error(
      "[Report Controller] Error:",
      error.message
    );

    return res.status(statusCode).json({
      success: false,
      message:
        statusCode >= 500 && statusCode !== 503
          ? "Internal server error"
          : error.message,
    });
  }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  generateReport,
};
