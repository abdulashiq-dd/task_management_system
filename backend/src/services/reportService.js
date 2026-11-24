const logger = require("../utils/logger");

const { validateUser } = require("../utils/taskAccess");

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

const { createError } = require("../utils/httpError");

// ==========================================
// 3. GENERATE DOWNLOADABLE REPORT
// ==========================================

async function generateReport(
  reportData,
  currentUser
) {

  validateUser(currentUser);

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

  logger.info("[Report Service] Report queued: [redacted]");

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
