const logger = require("../utils/logger");

const jobService = require("../services/jobService");

// ==========================================
// ERROR RESPONSE HANDLER
// ==========================================

function handleError(res, error) {
  const statusCode = error.statusCode || 500;

  logger.error("[Job Controller] Error", error);

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

async function getJobs(req, res) {
  try {
    const currentUser = {
      id: req.user.id,
      role: req.user.role,
    };

    const filters = {
      status: req.query.status,
      type: req.query.type,
      page: req.query.page,
      limit: req.query.limit,
    };

    const result = await jobService.getJobs(
      currentUser,
      filters
    );

    const { pagination, pageInfo } = require("../utils/pagination");
    const page = pagination(filters);
    const jobs = Array.isArray(result) ? result.slice(page.skip, page.skip + page.limit) : result.jobs;
    return res.status(200).json({
      success: true,
      message: "Jobs fetched successfully",
      pagination: Array.isArray(result) ? pageInfo(page.page, page.limit, result.length) : result.pagination,
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

async function getJobById(req, res) {
  try {
    const currentUser = {
      id: req.user.id,
      role: req.user.role,
    };

    const job = await jobService.getJobById(
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

async function getJobStats(req, res) {
  try {
    const currentUser = {
      id: req.user.id,
      role: req.user.role,
    };

    const stats =
      await jobService.getJobStats(currentUser);

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
