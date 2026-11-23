
const jobService = require("../services/jobService");

// ==========================================
// ERROR RESPONSE HANDLER
// ==========================================

function handleError(res, error) {
  const statusCode = error.statusCode || 500;

  console.error(
    "[Job Controller] Error:",
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

// ==========================================
// 1. GET ALL ACCESSIBLE JOBS
// GET /api/jobs
// ==========================================

function getJobs(req, res) {
  try {
    const currentUser = {
      id: req.user.id,
      role: req.user.role,
    };

    const filters = {
      status: req.query.status,
      type: req.query.type,
    };

    const jobs = jobService.getJobs(
      currentUser,
      filters
    );

    return res.status(200).json({
      success: true,
      message: "Jobs fetched successfully",
      count: jobs.length,
      jobs,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// ==========================================
// 2. GET JOB BY ID
// GET /api/jobs/:id
// ==========================================

function getJobById(req, res) {
  try {
    const currentUser = {
      id: req.user.id,
      role: req.user.role,
    };

    const job = jobService.getJobById(
      req.params.id,
      currentUser
    );

    return res.status(200).json({
      success: true,
      message: "Job fetched successfully",
      job,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// ==========================================
// 3. GET JOB STATISTICS
// GET /api/jobs/stats
// ==========================================

function getJobStats(req, res) {
  try {
    const currentUser = {
      id: req.user.id,
      role: req.user.role,
    };

    const stats =
      jobService.getJobStats(currentUser);

    return res.status(200).json({
      success: true,
      message: "Job statistics fetched successfully",
      stats,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  getJobs,
  getJobById,
  getJobStats,
};
