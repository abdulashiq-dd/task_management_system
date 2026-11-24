
const mongoose = require("mongoose");

const {
  queueExportJob
} = require("./exportJobService");

const {
  FILE_TYPES
} = require("../config/fileStorage");

// ==========================================
// 1. SUPPORTED REPORT TYPES
// ==========================================

const REPORT_TYPES = Object.freeze({

  TASK_SUMMARY: "taskSummary"

});

// ==========================================
// 2. CREATE CUSTOM ERROR
// ==========================================

function createError(message, statusCode) {

  const error = new Error(message);

  error.statusCode = statusCode;

  return error;

}

// ==========================================
// 3. GENERATE DOWNLOADABLE REPORT
// ==========================================

async function generateReport(
  reportData,
  currentUser
) {

  // Validate authenticated user.

  if (!currentUser || !currentUser.id) {

    throw createError(
      "Authentication required",
      401
    );

  }

  if (!mongoose.isValidObjectId(currentUser.id)) {

    throw createError(
      "Invalid user ID",
      400
    );

  }

  if (
    !["user", "admin"].includes(currentUser.role)
  ) {

    throw createError(
      "Invalid user role",
      403
    );

  }

  // Validate request data.

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

  if (
    !Object.values(REPORT_TYPES).includes(reportType)
  ) {

    throw createError(
      "Unsupported report type",
      400
    );

  }

  const unsupportedFields =
    Object.keys(reportData).filter(
      key => key !== "reportType"
    );

  if (unsupportedFields.length > 0) {

    throw createError(
      "Only reportType is supported",
      400
    );

  }

  // Milestone 10:
  // Create export metadata and submit background job.

  const job = await queueExportJob(

    FILE_TYPES.REPORT,

    currentUser,

    {}

  );

  console.log(
    `[Report Service] Report queued: ${job.id}`
  );

  return {

    ...job,

    reportType

  };

}

// ==========================================
// 4. EXPORT SERVICES
// ==========================================

module.exports = {

  generateReport,

  REPORT_TYPES

};
