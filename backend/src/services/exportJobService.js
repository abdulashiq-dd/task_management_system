const { createError } = require("../utils/httpError");
const logger = require("../utils/logger");

const mongoose = require("mongoose");
const { runtimeUser } = require("../utils/runtimeUser");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");

const {
  Export,
  EXPORT_STATUS,
  MIME_TYPES
} = require("../models/exportModel");

const {
  FILE_TYPES,
  fileExists,
  getFilePath,
  generateFileName,
  deleteFile
} = require("../config/fileStorage");

const {
  jobQueue,
  JOB_TYPES
} = require("../queues/jobQueue");

const {
  exportTasksAsJSON,
  exportTasksAsCSV
} = require("./exportService");

const {
  generateTaskSummaryReport
} = require("./reportFileService");

const {
  buildExportFilter
} = require("../utils/exportFilters");

const {
  NonRetryableError
} = require("../utils/jobErrors");

// ==========================================
// 1. EXPORT JOB TYPE MAPPING
// ==========================================

const EXPORT_JOB_TYPES = Object.freeze({

  [FILE_TYPES.JSON]:
    JOB_TYPES.JSON_EXPORT,

  [FILE_TYPES.CSV]:
    JOB_TYPES.CSV_EXPORT,

  [FILE_TYPES.REPORT]:
    JOB_TYPES.REPORT_GENERATION

});

// ==========================================
// 2. FORMAT EXPORT RESULT
// ==========================================

function formatExportResult(record) {

  return {

    exportId: String(record._id),

    backgroundJobId: record.backgroundJobId,

    type: record.type,

    fileName: record.fileName,

    mimeType: record.mimeType,

    size: record.size,

    totalRecords: record.totalRecords,
    generatedRole: record.generatedRole,

    status: record.status,

    completedAt: record.completedAt

  };

}

// ==========================================
// 3. VALIDATE JOB PAYLOAD
// ==========================================

function validateExportJob(job, expectedType) {

  if (
    !job ||
    typeof job.id !== "string" ||
    !job.id.trim() ||
    !job.payload
  ) {

    throw new NonRetryableError(
      "Invalid export job"
    );

  }

  if (
    !Object.values(FILE_TYPES).includes(expectedType)
  ) {

    throw new NonRetryableError(
      "Invalid export type"
    );

  }

  const {
    exportId,
    currentUser
  } = job.payload;

  if (!mongoose.isValidObjectId(exportId)) {

    throw new NonRetryableError(
      "Invalid export ID"
    );

  }

  // Validate authenticated user.

  if (!mongoose.isObjectIdOrHexString(currentUser?.id)) throw new NonRetryableError("Invalid job owner");

  // Verify job ownership.

  if (
    String(job.userId) !== String(currentUser.id)
  ) {

    throw new NonRetryableError(
      "Invalid export job owner"
    );

  }

}

// ==========================================
// 4. RESTORE COMPLETED EXPORT RESULT
// ==========================================

async function restoreCompletedResult(record) {

  const exists = await fileExists(
    record.type,
    record.fileName
  );

  if (!exists) {

    throw new NonRetryableError(
      "Completed export file is unavailable"
    );

  }

  const result = formatExportResult(record);

  // Restore previously generated report statistics.

  if (record.type === FILE_TYPES.REPORT) {

    const content = await fs.readFile(

      getFilePath(
        record.type,
        record.fileName
      ),

      "utf8"

    );

    const report = JSON.parse(content);

    return {
      ...report,
      ...result
    };

  }

  return result;

}

// ==========================================
// 5. PROCESS EXPORT JOB
// ==========================================

async function processExportJob(
  job,
  expectedType
) {

  validateExportJob(job, expectedType);

  const {
    exportId,
  } = job.payload;
  const currentUser = await runtimeUser(job.userId);

  const record = await Export.findById(
    exportId
  );

  if (!record) {

    throw new NonRetryableError(
      "Export record not found"
    );

  }

  // Verify job identity, ownership and format.

  if (

    record.backgroundJobId !== job.id ||

    String(record.userId) !==
      String(currentUser.id) ||

    record.type !== expectedType

  ) {

    throw new NonRetryableError(
      "Export job metadata mismatch"
    );

  }

  // Reuse completed exports.
  // Prevent duplicate file generation.

  if (
    record.status === EXPORT_STATUS.COMPLETED
  ) {

    logger.info("[Export Job] Reusing completed export");

    if (currentUser.role !== "admin" && record.generatedRole !== "user") throw new NonRetryableError("Existing export scope is no longer authorized");
    return restoreCompletedResult(record);

  }

  // Permanently failed exports cannot be processed.

  if (
    record.status === EXPORT_STATUS.FAILED
  ) {

    throw new NonRetryableError(
      "Export has permanently failed"
    );

  }

  // Update processing status.

  record.status = EXPORT_STATUS.PROCESSING;

  record.error = null;

  record.failedAt = null;

  await record.save();

  logger.info("[Export Job] Processing");

  // Convert Mongoose filters to a plain object.

  const filters = record.filters
    ? record.filters.toObject()
    : {};

  let generatedFile;

  // Generate requested file format.
  // Reuse the original stored filename during retries.

  switch (record.type) {

    // JSON export.

    case FILE_TYPES.JSON:

      generatedFile = await exportTasksAsJSON(
        currentUser,
        filters,
        record.fileName
      );

      break;

    // CSV export.

    case FILE_TYPES.CSV:

      generatedFile = await exportTasksAsCSV(
        currentUser,
        filters,
        record.fileName
      );

      break;

    // Task summary report.

    case FILE_TYPES.REPORT:

      generatedFile = await generateTaskSummaryReport(
        currentUser,
        record.fileName
      );

      break;

    default:

      throw new NonRetryableError(
        "Unsupported export type"
      );

  }

  // Demotion/deletion during generation must not publish a privileged artifact.
  try {
    const refreshed = await runtimeUser(currentUser.id);
    if (currentUser.role === "admin" && refreshed.role !== "admin") throw new NonRetryableError("Export authorization changed during generation");
  } catch (error) {
    await deleteFile(record.type, record.fileName);
    throw error;
  }
  record.generatedRole = currentUser.role;
  // Persist successful file generation.

  record.size = generatedFile.size;

  record.totalRecords =
    generatedFile.totalRecords;

  record.status = EXPORT_STATUS.COMPLETED;

  record.completedAt = new Date();

  record.failedAt = null;

  record.error = null;

  await record.save();

  logger.info("[Export Job] Completed");

  const result = formatExportResult(record);

  // Preserve report statistics.

  if (record.type === FILE_TYPES.REPORT) {

    return {
      ...generatedFile.report,
      ...result
    };

  }

  return result;

}

// ==========================================
// 6. SUBMIT EXPORT JOB
// MILESTONE 10 - BACKGROUND QUEUE
// ==========================================

async function queueExportJob(
  type,
  currentUser,
  filters = {},
  queue = jobQueue
) {

  // Validate export type.

  if (!Object.values(FILE_TYPES).includes(type)) {

    throw createError("Invalid export type", 400);

  }

  // Validate user authentication and filters.

  buildExportFilter(
    currentUser,
    filters
  );

  // Summary reports do not support task filters.

  if (

    type === FILE_TYPES.REPORT &&

    Object.keys(filters).length > 0

  ) {

    throw createError("Task summary reports do not support filters", 400);

  }

  // Generate a unique background job ID
  // before creating the database record.

  const backgroundJobId = randomUUID();

  // Create persistent export metadata.

  const record = await Export.create({

    userId: currentUser.id,

    backgroundJobId,

    type,

    fileName: generateFileName(type),

    mimeType: MIME_TYPES[type],

    status: EXPORT_STATUS.PENDING,

    filters

  });

  // Build background job payload.

  const payload = {

    exportId: String(record._id),

    currentUser: {

      id: String(currentUser.id)

    }

  };

  // Add report type when generating a report.

  if (type === FILE_TYPES.REPORT) {

    payload.reportType = "taskSummary";

  }

  let job;

  try {

    // Submit job using predefined background job ID.

    job = await queue.enqueue(

      EXPORT_JOB_TYPES[type],

      payload,

      currentUser.id,

      {
        jobId: backgroundJobId
      }

    );

  } catch (error) {

    // Remove pending export metadata when
    // submission to the queue fails.

    try {

      await Export.deleteOne({

        _id: record._id,

        backgroundJobId,

        status: EXPORT_STATUS.PENDING

      });

    } catch (cleanupError) {

      logger.error("[Export Job] Submission cleanup failed", cleanupError);

    }

    throw error;

  }

  logger.info("[Export Job] Queued");

  // Return immediately after queue submission.
  // Do not wait for file generation.

  return {

    id: job.id,

    exportId: String(record._id),

    type: job.type,

    exportType: record.type,

    fileName: record.fileName,

    status: job.status,

    createdAt: job.createdAt

  };

}

// ==========================================
// 7. UPDATE EXPORT AFTER FAILED ATTEMPT
// MILESTONE 10 - RETRY INTEGRATION
// ==========================================

async function updateExportFailure(
  job,
  willRetry
) {

  const exportId = job.payload?.exportId;

  // Notification and activity log jobs
  // do not have export metadata.

  if (!mongoose.isValidObjectId(exportId)) {

    return null;

  }

  // Identify the corresponding export type.

  const exportType = Object.keys(
    EXPORT_JOB_TYPES
  ).find(

    type =>
      EXPORT_JOB_TYPES[type] === job.type

  );

  if (!exportType) {

    return null;

  }

  // Determine the appropriate status.

  const status = willRetry

    ? EXPORT_STATUS.RETRYING

    : EXPORT_STATUS.FAILED;

  // Update persistent export metadata.

  const updatedRecord = await Export.findOneAndUpdate(

    // Validate job ID, export ID and owner.

    {

      _id: exportId,

      backgroundJobId: job.id,

      userId: job.userId,

      type: exportType,

      // Do not overwrite terminal statuses.

      status: {

        $nin: [

          EXPORT_STATUS.COMPLETED,

          EXPORT_STATUS.FAILED

        ]

      }

    },

    {

      $set: {

        status,

        error: willRetry

          ? "Export attempt failed. Retry scheduled."

          : "Export generation failed",

        completedAt: null,

        failedAt: willRetry

          ? null

          : new Date()

      }

    },

    {

      returnDocument: "after",

      runValidators: true

    }

  );

  if (updatedRecord) {

    logger.info("[Export Job] Metadata status updated");

  }

  return updatedRecord;

}

// ==========================================
// 8. EXPORT FUNCTIONS
// ==========================================

module.exports = {

  formatExportResult,

  processExportJob,

  queueExportJob,

  updateExportFailure,

  EXPORT_JOB_TYPES

};
