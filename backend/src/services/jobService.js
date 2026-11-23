
const mongoose = require("mongoose");

const {
  jobQueue,
  JOB_STATUS,
  JOB_TYPES,
} = require("../queues/jobQueue");

const {
  jobWorker,
} = require("../workers/jobWorker");

// ==========================================
// HELPER - ERROR HANDLING
// ==========================================

function createError(message, statusCode) {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
}

// ==========================================
// HELPER - VALIDATE AUTHENTICATED USER
// ==========================================

function validateUser(currentUser) {

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

  if (!["user", "admin"].includes(currentUser.role)) {

    throw createError(
      "Access denied",
      403
    );
  }
}

// ==========================================
// HELPER - FORMAT PUBLIC JOB RESPONSE
// ==========================================

function formatJob(job, includeResult = false) {

  const formattedJob = {

    id: job.id,

    type: job.type,

    userId: job.userId,

    status: job.status,

    // Milestone 9: Retry metadata.

    attempts: job.attempts,

    maxAttempts: job.maxRetries + 1,

    retryCount: job.retryCount,

    maxRetries: job.maxRetries,

    retryDelay: job.retryDelay,

    nextRetryAt: job.nextRetryAt,

    isPermanentlyFailed:
      job.isPermanentlyFailed,

    createdAt: job.createdAt,

    startedAt: job.startedAt,

    lastAttemptAt: job.lastAttemptAt,

    completedAt: job.completedAt,

    failedAt: job.failedAt,
  };

  if (includeResult) {

    formattedJob.result = job.result;

    // Return sanitized errors to API clients.
    // Internal database errors remain in the queue.

    formattedJob.error =

      job.status === JOB_STATUS.FAILED

        ? "Job execution failed"

        : null;

    formattedJob.lastError = job.lastError

      ? "Job attempt failed"

      : null;

    formattedJob.errorHistory = (
      job.errorHistory || []
    ).map(error => ({

      attempt: error.attempt,

      message: "Job attempt failed",

      timestamp: error.timestamp,

      retryable: error.retryable,
    }));
  }

  return formattedJob;
}

// ==========================================
// HELPER - GET ACCESSIBLE JOBS
// ==========================================

function getAccessibleJobs(currentUser) {

  validateUser(currentUser);

  // Administrators can access all jobs.

  if (currentUser.role === "admin") {

    return jobQueue.getAllJobs();
  }

  // Regular users can access only their jobs.

  return jobQueue.getUserJobs(
    String(currentUser.id)
  );
}

// ==========================================
// 1. GET ALL ACCESSIBLE JOBS
// ==========================================

function getJobs(currentUser, filters = {}) {

  let jobs = getAccessibleJobs(currentUser);

  const {
    status,
    type,
  } = filters;

  const validStatuses =
    Object.values(JOB_STATUS);

  const validTypes =
    Object.values(JOB_TYPES);

  // Filter jobs by status.

  if (status !== undefined) {

    if (!validStatuses.includes(status)) {

      throw createError(
        "Invalid job status",
        400
      );
    }

    jobs = jobs.filter(
      job => job.status === status
    );
  }

  // Filter jobs by type.

  if (type !== undefined) {

    if (!validTypes.includes(type)) {

      throw createError(
        "Invalid job type",
        400
      );
    }

    jobs = jobs.filter(
      job => job.type === type
    );
  }

  return jobs.map(job =>
    formatJob(job)
  );
}

// ==========================================
// 2. GET JOB BY ID
// ==========================================

function getJobById(jobId, currentUser) {

  validateUser(currentUser);

  if (
    typeof jobId !== "string" ||
    !jobId.trim()
  ) {

    throw createError(
      "Job ID is required",
      400
    );
  }

  const job = jobQueue.getJob(jobId);

  if (!job) {

    throw createError(
      "Job not found",
      404
    );
  }

  // Prevent unauthorized job access.

  if (
    currentUser.role !== "admin" &&

    String(job.userId) !==
      String(currentUser.id)
  ) {

    throw createError(
      "Job not found",
      404
    );
  }

  return formatJob(job, true);
}

// ==========================================
// 3. GET JOB STATISTICS
// ==========================================

function getJobStats(currentUser) {

  const jobs = getAccessibleJobs(currentUser);

  const queueStats = jobQueue.getStats(jobs);

  // Milestone 9: Retry statistics.

  const retryStats = {

    totalAttempts: jobs.reduce(

      (total, job) =>
        total + job.attempts,

      0
    ),

    totalRetriesScheduled: jobs.reduce(

      (total, job) =>
        total + job.retryCount,

      0
    ),

    totalRetryAttempts: jobs.reduce(

      (total, job) =>
        total + Math.max(
          0,
          job.attempts - 1
        ),

      0
    ),

    failedAttempts: jobs.reduce(

      (total, job) =>
        total + job.errorHistory.length,

      0
    ),

    retriedJobs: jobs.filter(

      job => job.retryCount > 0

    ).length,

    recoveredJobs: jobs.filter(

      job =>

        job.status === JOB_STATUS.COMPLETED &&

        job.attempts > 1

    ).length,

    permanentlyFailedJobs: jobs.filter(

      job => job.isPermanentlyFailed

    ).length,

    awaitingRetry: queueStats.retrying,
  };

  const response = {

    queue: queueStats,

    retries: retryStats,
  };

  // Worker-wide statistics are admin only.

  if (currentUser.role === "admin") {

    response.worker = jobWorker.getStats();
  }

  return response;
}

// ==========================================
// EXPORT SERVICES
// ==========================================

module.exports = {

  getJobs,

  getJobById,

  getJobStats,
};
