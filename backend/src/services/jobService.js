
const mongoose = require("mongoose");
const { pagination, pageInfo } = require("../utils/pagination");

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

const { createError } = require("../utils/httpError");

// ==========================================
// HELPER - VALIDATE AUTHENTICATED USER
// ==========================================

const { validateUser } = require("../utils/taskAccess");

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
  if (jobQueue.persistent) return getJobsPersistent(currentUser, filters);

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
  if (jobQueue.persistent) return getJobByIdPersistent(jobId, currentUser);

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
  if (jobQueue.persistent) return getJobStatsPersistent(currentUser);

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

function ownerFilter(currentUser) {
  validateUser(currentUser);
  return currentUser.role === "admin" ? {} : { userId: String(currentUser.id) };
}
async function getJobsPersistent(currentUser, filters) {
  const filter = ownerFilter(currentUser);
  if (filters.status !== undefined) {
    if (!Object.values(JOB_STATUS).includes(filters.status)) throw createError("Invalid job status", 400);
    filter.status = filters.status;
  }
  if (filters.type !== undefined) {
    if (!Object.values(JOB_TYPES).includes(filters.type)) throw createError("Invalid job type", 400);
    filter.type = filters.type;
  }
  const page = pagination(filters);
  const result = await jobQueue.list(filter, page);
  return { jobs: result.jobs.map(job => formatJob(job)), pagination: pageInfo(page.page, page.limit, result.total) };
}
async function getJobByIdPersistent(jobId, currentUser) {
  const filter = ownerFilter(currentUser);
  if (typeof jobId !== "string" || !jobId.trim()) throw createError("Job ID is required", 400);
  const job = await jobQueue.getJob(jobId);
  if (!job || (filter.userId && filter.userId !== job.userId)) throw createError("Job not found", 404);
  const publicJob = formatJob(job, true);
  if (currentUser.role !== "admin" && [JOB_TYPES.REPORT_GENERATION, JOB_TYPES.JSON_EXPORT, JOB_TYPES.CSV_EXPORT].includes(job.type) && publicJob.result?.generatedRole !== "user") publicJob.result = null;
  return publicJob;
}
async function getJobStatsPersistent(currentUser) {
  const result = await jobQueue.statistics(ownerFilter(currentUser));
  if (currentUser.role === "admin") result.worker = { ...jobWorker.getStats(), delayedJobs: await jobQueue.getDelayedCount() };
  return result;
}
module.exports = {

  getJobs,

  getJobById,

  getJobStats,
};
