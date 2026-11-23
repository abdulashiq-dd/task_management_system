
const { randomUUID } = require("node:crypto");

const {
  calculateBackoff,
} = require("../utils/retry");

// ==========================================
// JOB TYPES
// ==========================================

const JOB_TYPES = Object.freeze({
  NOTIFICATION: "notification",
  ACTIVITY_LOG: "activityLog",
  REPORT_GENERATION: "reportGeneration",
});

// ==========================================
// JOB STATES
// ==========================================

const JOB_STATUS = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  RETRYING: "retrying",
  COMPLETED: "completed",
  FAILED: "failed",
});

// ==========================================
// RETRY CONFIGURATION
// ==========================================

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

// ==========================================
// JOB QUEUE CLASS
// ==========================================

class JobQueue {
  constructor({
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY_MS,
  } = {}) {

    if (
      !Number.isInteger(maxRetries) ||
      maxRetries < 0 ||
      maxRetries > 3
    ) {
      throw new Error(
        "Maximum retries must be an integer between 0 and 3"
      );
    }

    if (
      !Number.isSafeInteger(retryDelay) ||
      retryDelay < 0 ||
      retryDelay > 536870911
    ) {
      throw new Error(
        "Retry delay must be a supported non-negative integer"
      );
    }

    // FIFO pending queue.
    this.pendingJobs = [];

    // Stores delayed jobs awaiting retry.
    this.delayedJobs = new Map();

    // Stores all job records.
    this.jobs = new Map();

    // Retry configuration.
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;

    // Memory protection limits.
    this.maxActiveJobs = 1000;
    this.maxFinishedJobs = 1000;
  }

  // ========================================
  // 1. ADD JOB TO QUEUE
  // ========================================

  enqueue(type, payload, userId = null) {

    if (!Object.values(JOB_TYPES).includes(type)) {
      throw new Error(`Invalid job type: ${type}`);
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    ) {
      throw new Error("Job payload must be an object");
    }

    const stats = this.getStats();

    // Include delayed retry jobs in memory limits.
    const activeJobs =
      stats.pending +
      stats.processing +
      stats.retrying;

    if (activeJobs >= this.maxActiveJobs) {
      const error = new Error("Job queue is full");
      error.statusCode = 503;
      throw error;
    }

    const job = {
      id: randomUUID(),
      type,
      userId: userId ? String(userId) : null,
      payload,

      status: JOB_STATUS.PENDING,

      result: null,
      error: null,

      // Retry metadata.
      attempts: 0,
      maxRetries: this.maxRetries,
      retryCount: 0,
      retryDelay: this.retryDelay,

      nextRetryAt: null,
      lastError: null,
      errorHistory: [],

      failedAt: null,
      isPermanentlyFailed: false,

      // Execution timestamps.
      createdAt: new Date(),
      startedAt: null,
      lastAttemptAt: null,
      completedAt: null,
    };

    this.jobs.set(job.id, job);

    this.pendingJobs.push(job.id);

    console.log(
      `[Job Queue] Job added: ${job.type} | ${job.id}`
    );

    return job;
  }

  // ========================================
  // 2. RETRIEVE NEXT PENDING JOB
  // ========================================

  dequeue() {

    // Promote retry jobs whose waiting period
    // has completed.
    this.promoteDelayedJobs();

    while (this.pendingJobs.length > 0) {

      const jobId = this.pendingJobs.shift();

      const job = this.jobs.get(jobId);

      if (job?.status === JOB_STATUS.PENDING) {
        return this.markProcessing(jobId);
      }
    }

    return null;
  }

  // ========================================
  // 3. MARK JOB AS PROCESSING
  // ========================================

  markProcessing(jobId) {

    const job = this.jobs.get(jobId);

    if (!job || job.status !== JOB_STATUS.PENDING) {
      return null;
    }

    const now = new Date();

    job.status = JOB_STATUS.PROCESSING;

    // Count every execution attempt.
    job.attempts++;

    // Preserve the first execution timestamp.
    if (!job.startedAt) {
      job.startedAt = now;
    }

    job.lastAttemptAt = now;
    job.nextRetryAt = null;

    console.log(
      `[Job Queue] Processing: ${job.type} | ${job.id}`
    );

    console.log(
      `[Job Queue] Attempt ${job.attempts} of ${job.maxRetries + 1}`
    );

    return job;
  }

  // ========================================
  // 4. MARK JOB AS COMPLETED
  // ========================================

  markCompleted(jobId, result = null) {

    const job = this.jobs.get(jobId);

    if (
      !job ||
      job.status !== JOB_STATUS.PROCESSING
    ) {
      return null;
    }

    job.status = JOB_STATUS.COMPLETED;

    job.result = result;
    job.error = null;

    job.nextRetryAt = null;
    job.failedAt = null;
    job.isPermanentlyFailed = false;

    job.completedAt = new Date();

    this.delayedJobs.delete(jobId);

    // Preserve lastError and errorHistory
    // for debugging previously failed attempts.

    console.log(
      `[Job Queue] Completed: ${job.type} | ${job.id}`
    );

    console.log(
      `[Job Queue] Total attempts: ${job.attempts}`
    );

    this.pruneFinishedJobs();

    return job;
  }

  // ========================================
  // 5. HANDLE JOB FAILURE
  // ========================================

  markFailed(
    jobId,
    error,
    { retryable = true } = {}
  ) {

    const job = this.jobs.get(jobId);

    if (
      !job ||
      job.status !== JOB_STATUS.PROCESSING
    ) {
      return null;
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    const errorDetails = {
      attempt: job.attempts,

      name:
        error instanceof Error
          ? error.name
          : "UnknownError",

      message: errorMessage,

      code: error?.code ?? null,

      timestamp: new Date(),

      retryable,
    };

    job.error = errorMessage;
    job.lastError = errorMessage;

    job.errorHistory.push(errorDetails);

    job.result = null;

    console.error(
      `[Job Queue] Attempt ${job.attempts} failed | ${job.id}`
    );

    console.error(
      `[Job Queue] Error: ${errorMessage}`
    );

    // Retry only if the error is retryable
    // and retries are still available.
    if (
      retryable &&
      job.retryCount < job.maxRetries
    ) {
      return this.scheduleRetry(jobId);
    }

    return this.markPermanentlyFailed(jobId);
  }

  // ========================================
  // 6. SCHEDULE NEXT RETRY
  // ========================================

  scheduleRetry(jobId) {

    const job = this.jobs.get(jobId);

    if (
      !job ||
      job.status !== JOB_STATUS.PROCESSING ||
      job.retryCount >= job.maxRetries
    ) {
      return null;
    }

    // Count additional retry attempts.
    job.retryCount++;

    // Calculate exponential backoff.
    const delay = calculateBackoff(
      job.retryDelay,
      job.retryCount
    );

    const retryTime = Date.now() + delay;

    job.status = JOB_STATUS.RETRYING;

    job.nextRetryAt = new Date(retryTime);

    job.completedAt = null;

    // Store the delayed job without blocking
    // a worker execution slot.
    this.delayedJobs.set(
      job.id,
      retryTime
    );

    console.log(
      `[Job Queue] Retry ${job.retryCount}/${job.maxRetries} scheduled`
    );

    console.log(
      `[Job Queue] Job: ${job.id}`
    );

    console.log(
      `[Job Queue] Retry delay: ${delay} ms`
    );

    console.log(
      `[Job Queue] Next retry: ${job.nextRetryAt.toISOString()}`
    );

    return job;
  }

  // ========================================
  // 7. PROMOTE DELAYED JOBS
  // ========================================

  promoteDelayedJobs() {

    const now = Date.now();

    const readyJobs = Array.from(
      this.delayedJobs.entries()
    )
      .filter(
        ([jobId, retryTime]) =>
          retryTime <= now
      )
      .sort(
        (a, b) => a[1] - b[1]
      );

    let promoted = 0;

    for (const [jobId] of readyJobs) {

      const job = this.jobs.get(jobId);

      this.delayedJobs.delete(jobId);

      if (
        !job ||
        job.status !== JOB_STATUS.RETRYING
      ) {
        continue;
      }

      job.status = JOB_STATUS.PENDING;

      job.nextRetryAt = null;

      // Add eligible retry jobs to the end
      // of the existing FIFO queue.
      this.pendingJobs.push(jobId);

      promoted++;

      console.log(
        `[Job Queue] Retry job ready: ${jobId}`
      );
    }

    return promoted;
  }

  // ========================================
  // 8. MARK PERMANENT FAILURE
  // ========================================

  markPermanentlyFailed(jobId) {

    const job = this.jobs.get(jobId);

    if (
      !job ||
      job.status !== JOB_STATUS.PROCESSING
    ) {
      return null;
    }

    const now = new Date();

    job.status = JOB_STATUS.FAILED;

    job.isPermanentlyFailed = true;

    job.failedAt = now;
    job.completedAt = now;

    job.nextRetryAt = null;

    job.result = null;

    this.delayedJobs.delete(jobId);

    console.error(
      `[Job Queue] Permanently failed: ${job.type} | ${job.id}`
    );

    console.error(
      `[Job Queue] Total attempts: ${job.attempts}`
    );

    console.error(
      `[Job Queue] Total retries: ${job.retryCount}`
    );

    this.pruneFinishedJobs();

    return job;
  }

  // ========================================
  // 9. GET ONE JOB
  // ========================================

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  // ========================================
  // 10. GET ALL JOBS
  // ========================================

  getAllJobs() {

    return Array.from(
      this.jobs.values()
    ).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }

  // ========================================
  // 11. GET USER-SPECIFIC JOBS
  // ========================================

  getUserJobs(userId) {

    return this.getAllJobs().filter(
      (job) => job.userId === String(userId)
    );
  }

  // ========================================
  // 12. GET JOB QUEUE STATISTICS
  // ========================================

  getStats(
    jobs = Array.from(this.jobs.values())
  ) {

    const stats = {
      total: jobs.length,
      pending: 0,
      processing: 0,
      retrying: 0,
      completed: 0,
      failed: 0,
    };

    for (const job of jobs) {

      if (
        Object.prototype.hasOwnProperty.call(
          stats,
          job.status
        ) &&
        job.status !== "total"
      ) {
        stats[job.status]++;
      }
    }

    return stats;
  }

  // ========================================
  // 13. GET PENDING QUEUE SIZE
  // ========================================

  getPendingCount() {

    this.promoteDelayedJobs();

    return this.pendingJobs.length;
  }

  // ========================================
  // 14. GET DELAYED QUEUE SIZE
  // ========================================

  getDelayedCount() {
    return this.delayedJobs.size;
  }

  // ========================================
  // 15. REMOVE OLD FINISHED JOBS
  // ========================================

  pruneFinishedJobs() {

    const finishedJobs = Array.from(
      this.jobs.values()
    )
      .filter(
        (job) =>
          job.status === JOB_STATUS.COMPLETED ||
          job.status === JOB_STATUS.FAILED
      )
      .sort(
        (a, b) =>
          a.completedAt - b.completedAt
      );

    const excess =
      finishedJobs.length -
      this.maxFinishedJobs;

    if (excess <= 0) {
      return;
    }

    for (let i = 0; i < excess; i++) {
      this.jobs.delete(finishedJobs[i].id);
    }
  }
}

// ==========================================
// SHARED QUEUE INSTANCE
// ==========================================

const jobQueue = new JobQueue();

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  JobQueue,
  jobQueue,
  JOB_TYPES,
  JOB_STATUS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
};
