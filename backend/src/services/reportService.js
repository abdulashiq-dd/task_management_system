
const mongoose = require("mongoose");

const {
  jobQueue,
  JOB_TYPES,
} = require("../queues/jobQueue");

// ==========================================
// SUPPORTED REPORT TYPES
// ==========================================

const REPORT_TYPES = Object.freeze({
  TASK_SUMMARY: "taskSummary",
});

// ==========================================
// CREATE CUSTOM ERROR
// ==========================================

function createError(message, statusCode) {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
}

// ==========================================
// GENERATE REPORT JOB
// ==========================================

function generateReport(reportData, currentUser) {
  if (!currentUser || !currentUser.id) {
    throw createError(
      "Authentication required",
      401
    );
  }

  if (!mongoose.isValidObjectId(currentUser.id)) {
    throw createError("Invalid user ID", 400);
  }

  if (!["user", "admin"].includes(currentUser.role)) {
    throw createError("Invalid user role", 403);
  }

  if (
    !reportData ||
    typeof reportData !== "object" ||
    Array.isArray(reportData)
  ) {
    throw createError(
      "Invalid report request",
      400
    );
  }

  const { reportType } = reportData;

  if (!Object.values(REPORT_TYPES).includes(reportType)) {
    throw createError(
      "Unsupported report type",
      400
    );
  }

  // Use authenticated user details rather than
  // trusting user information from the request body.
  const payload = {
    reportType,

    currentUser: {
      id: String(currentUser.id),
      role: currentUser.role,
    },
  };

  // Add report generation to the queue.
  // Do not wait for the report to finish.
  const job = jobQueue.enqueue(
    JOB_TYPES.REPORT_GENERATION,
    payload,
    currentUser.id
  );

  console.log(
    `[Report Service] Report queued: ${job.id}`
  );

  return {
    id: job.id,
    type: job.type,
    reportType,
    status: job.status,
    createdAt: job.createdAt,
  };
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  generateReport,
  REPORT_TYPES,
};
