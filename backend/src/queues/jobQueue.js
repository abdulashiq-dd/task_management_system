
const { randomUUID } = require("node:crypto");

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
  COMPLETED: "completed",
  FAILED: "failed",
});

// ==========================================
// JOB QUEUE CLASS
// ==========================================

class JobQueue {
  constructor() {
    // Maintains FIFO order.
    this.pendingJobs = [];

    // Stores all job records by ID.
    this.jobs = new Map();

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

    if (
      stats.pending + stats.processing >=
      this.maxActiveJobs
    ) {
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
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    };

    // Store the job.
    this.jobs.set(job.id, job);

    // Add job ID to the end of the queue.
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
    while (this.pendingJobs.length > 0) {
      // Remove the first job ID.
      const jobId = this.pendingJobs.shift();

      const job = this.jobs.get(jobId);

      if (job?.status === JOB_STATUS.PENDING) {
        // Claim the job before returning it.
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

    job.status = JOB_STATUS.PROCESSING;
    job.startedAt = new Date();

    console.log(
      `[Job Queue] Processing: ${job.type} | ${job.id}`
    );

    return job;
  }

  // ========================================
  // 4. MARK JOB AS COMPLETED
  // ========================================

  markCompleted(jobId, result = null) {
    const job = this.jobs.get(jobId);

    if (!job || job.status !== JOB_STATUS.PROCESSING) {
      return null;
    }

    job.status = JOB_STATUS.COMPLETED;
    job.result = result;
    job.error = null;
    job.completedAt = new Date();

    console.log(
      `[Job Queue] Completed: ${job.type} | ${job.id}`
    );

    this.pruneFinishedJobs();

    return job;
  }

  // ========================================
  // 5. MARK JOB AS FAILED
  // ========================================

  markFailed(jobId, error) {
    const job = this.jobs.get(jobId);

    if (!job || job.status !== JOB_STATUS.PROCESSING) {
      return null;
    }

    job.status = JOB_STATUS.FAILED;
    job.result = null;
    job.error =
      error instanceof Error
        ? error.message
        : String(error);

    job.completedAt = new Date();

    console.error(
      `[Job Queue] Failed: ${job.type} | ${job.id}`
    );

    console.error(`[Job Queue] Error: ${job.error}`);

    this.pruneFinishedJobs();

    return job;
  }

  // ========================================
  // 6. GET ONE JOB
  // ========================================

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  // ========================================
  // 7. GET ALL JOBS
  // ========================================

  getAllJobs() {
    return Array.from(this.jobs.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }

  // ========================================
  // 8. GET USER-SPECIFIC JOBS
  // ========================================

  getUserJobs(userId) {
    return this.getAllJobs().filter(
      (job) => job.userId === String(userId)
    );
  }

  // ========================================
  // 9. GET JOB QUEUE STATISTICS
  // ========================================

  getStats(jobs = Array.from(this.jobs.values())) {
    const stats = {
      total: jobs.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const job of jobs) {
      stats[job.status]++;
    }

    return stats;
  }

  // ========================================
  // 10. CHECK PENDING QUEUE SIZE
  // ========================================

  getPendingCount() {
    return this.pendingJobs.length;
  }

  // ========================================
  // 11. REMOVE OLD FINISHED JOBS
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
        (a, b) => a.completedAt - b.completedAt
      );

    const excess =
      finishedJobs.length - this.maxFinishedJobs;

    if (excess <= 0) {
      return;
    }

    for (let i = 0; i < excess; i++) {
      this.jobs.delete(finishedJobs[i].id);
    }
  }
}

// ==========================================
// CREATE SHARED QUEUE INSTANCE
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
};
