
const mongoose = require("mongoose");

const { jobQueue } = require("../queues/jobQueue");

const { jobWorker } = require("../workers/jobWorker");

// ==========================================
// 1. CREATE CUSTOM ERROR
// ==========================================

function createError(message, statusCode) {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
}

// ==========================================
// 2. VALIDATE AUTHENTICATED USER
// ==========================================

function validateUser(currentUser) {
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
}

// ==========================================
// 3. FORMAT PUBLIC JOB RESPONSE
// ==========================================

function formatJob(job, includeResult = false) {
  const response = {
    id: job.id,
    type: job.type,
    userId: job.userId,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };

  if (includeResult) {
    response.result = job.result;

    // Avoid exposing internal database errors.
    response.error =
      job.status === "failed"
        ? "Job execution failed"
        : null;
  }

  return response;
}

// ==========================================
// 4. GET ACCESSIBLE JOBS
// ==========================================

function getAccessibleJobs(currentUser) {
  validateUser(currentUser);

  if (currentUser.role === "admin") {
    return jobQueue.getAllJobs();
  }

  return jobQueue.getUserJobs(currentUser.id);
}

// ==========================================
// 5. GET JOB LIST
// ==========================================

function getJobs(currentUser, filters = {}) {
  let jobs = getAccessibleJobs(currentUser);

  const { status, type } = filters;

  const validStatuses = [
    "pending",
    "processing",
    "completed",
    "failed",
  ];

  const validTypes = [
    "notification",
    "activityLog",
    "reportGeneration",
  ];

  if (
    status !== undefined &&
    !validStatuses.includes(status)
  ) {
    throw createError("Invalid job status", 400);
  }

  if (
    type !== undefined &&
    !validTypes.includes(type)
  ) {
    throw createError("Invalid job type", 400);
  }

  if (status) {
    jobs = jobs.filter(
      (job) => job.status === status
    );
  }

  if (type) {
    jobs = jobs.filter(
      (job) => job.type === type
    );
  }

  return jobs.map((job) => formatJob(job));
}

// ==========================================
// 6. GET JOB BY ID
// ==========================================

function getJobById(jobId, currentUser) {
  validateUser(currentUser);

  const job = jobQueue.getJob(jobId);

  if (!job) {
    throw createError("Job not found", 404);
  }

  const isOwner =
    job.userId === String(currentUser.id);

  const isAdmin =
    currentUser.role === "admin";

  if (!isOwner && !isAdmin) {
    throw createError("Job not found", 404);
  }

  return formatJob(job, true);
}

// ==========================================
// 7. GET JOB STATISTICS
// ==========================================

function getJobStats(currentUser) {
  const jobs = getAccessibleJobs(currentUser);

  const stats = jobQueue.getStats(jobs);

  const response = {
    queue: stats,
  };

  // Global worker statistics are admin-only.
  if (currentUser.role === "admin") {
    response.worker = jobWorker.getStats();
  }

  return response;
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  getJobs,
  getJobById,
  getJobStats,
};
