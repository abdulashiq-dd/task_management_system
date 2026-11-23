const { jobQueue, JOB_STATUS, JOB_TYPES } = require("../queues/jobQueue");

const { executeJob } = require("./jobHandlers");

const { isRetryableError } = require("../utils/jobErrors");

// ==========================================
// WORKER CONFIGURATION
// ==========================================

const DEFAULT_CONCURRENCY = 2;

const DEFAULT_POLL_INTERVAL_MS = 500;

// ==========================================
// BACKGROUND WORKER CLASS
// ==========================================

class JobWorker {
  constructor({
    queue = jobQueue,
    handler = executeJob,
    concurrency = DEFAULT_CONCURRENCY,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  } = {}) {
    // Validate configuration.

    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("Concurrency must be a positive integer");
    }

    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1) {
      throw new Error("Poll interval must be a positive integer");
    }

    if (typeof handler !== "function") {
      throw new TypeError("Job handler must be a function");
    }

    this.queue = queue;
    this.handler = handler;

    this.concurrency = concurrency;
    this.pollIntervalMs = pollIntervalMs;

    this.isRunning = false;
    this.isStopping = false;

    this.activeJobs = 0;

    this.intervalHandle = null;
    this.stopPromise = null;

    this.inFlightJobs = new Set();

    // Extended worker statistics.

    this.stats = {
      // Terminal jobs.
      totalProcessed: 0,
      completed: 0,
      failed: 0,

      // Execution attempt statistics.
      totalAttempts: 0,
      failedAttempts: 0,

      // Retry statistics.
      retriesScheduled: 0,
      retryAttempts: 0,
      recovered: 0,
      permanentlyFailed: 0,

      maxConcurrentJobs: 0,
    };
  }

  // ========================================
  // 1. START WORKER
  // ========================================

  start() {
    if (this.isRunning || this.isStopping) {
      console.log("[Job Worker] Worker already running or stopping");

      return false;
    }

    this.isRunning = true;

    console.log("[Job Worker] Worker started");

    console.log(`[Job Worker] Concurrency: ${this.concurrency}`);

    console.log(`[Job Worker] Poll interval: ${this.pollIntervalMs} ms`);

    this.intervalHandle = setInterval(() => {
      this.processQueue();
    }, this.pollIntervalMs);

    // Immediately check available jobs.

    this.processQueue();

    return true;
  }

  // ========================================
  // 2. PROCESS QUEUE
  // ========================================

  processQueue() {
    if (!this.isRunning || this.isStopping) {
      return;
    }

    while (this.activeJobs < this.concurrency) {
      // dequeue() automatically promotes
      // eligible delayed retry jobs.

      const job = this.queue.dequeue();

      if (!job) {
        break;
      }

      // Reserve worker execution slot.

      this.activeJobs++;

      this.stats.maxConcurrentJobs = Math.max(
        this.stats.maxConcurrentJobs,
        this.activeJobs,
      );

      // Track the complete execution lifecycle,
      // including worker slot cleanup.

      const jobPromise = this.processJob(job)

        .catch((error) => {
          console.error(
            "[Job Worker] Unexpected worker error:",
            error instanceof Error ? error.message : String(error),
          );

          // Prevent an unexpected worker error
          // from leaving a job in processing state.

          const currentJob = this.queue.getJob(job.id);

          if (currentJob?.status === JOB_STATUS.PROCESSING) {
            const failedJob = this.queue.markFailed(job.id, error, {
              retryable: false,
            });

            if (failedJob?.status === JOB_STATUS.FAILED) {
              this.stats.failed++;
              this.stats.permanentlyFailed++;
              this.stats.totalProcessed++;
            }
          }
        })

        .finally(() => {
          // Release the slot after every attempt,
          // including attempts scheduled for retry.

          this.activeJobs--;

          this.inFlightJobs.delete(jobPromise);

          if (this.isRunning && !this.isStopping) {
            setImmediate(() => {
              this.processQueue();
            });
          }
        });

      // Track asynchronous execution.

      this.inFlightJobs.add(jobPromise);
    }
  }

  // ========================================
  // 3. PROCESS INDIVIDUAL JOB
  // ========================================

  async processJob(job) {
    console.log(`[Job Worker] Executing: ${job.type} | ${job.id}`);

    console.log(`[Job Worker] Attempt ${job.attempts}/${job.maxRetries + 1}`);

    this.stats.totalAttempts++;

    if (job.attempts > 1) {
      this.stats.retryAttempts++;
    }

    let result;

    try {
      // Execute actual background operation.

      result = await this.handler(job);
    } catch (error) {
      this.stats.failedAttempts++;

      const retryable = isRetryableError(error);

      // All supported production handlers now
      // support safe retries.
      //
      // Notification and activity log writes
      // are protected by unique backgroundJobId
      // indexes in MongoDB.

      const safeToRetry = [
        JOB_TYPES.NOTIFICATION,
        JOB_TYPES.ACTIVITY_LOG,
        JOB_TYPES.REPORT_GENERATION,
      ].includes(job.type);

      const shouldRetry = retryable && safeToRetry;

      const updatedJob = this.queue.markFailed(job.id, error, {
        retryable: shouldRetry,
      });

      if (!updatedJob) {
        console.error(`[Job Worker] Failed to update job: ${job.id}`);

        return;
      }

      // Retry scheduled.

      if (updatedJob.status === JOB_STATUS.RETRYING) {
        this.stats.retriesScheduled++;

        console.log(`[Job Worker] Retry scheduled: ${job.id}`);

        console.log(
          `[Job Worker] Retry count: ${job.retryCount}/${job.maxRetries}`,
        );

        // Return immediately.
        // finally() releases the worker slot.

        return;
      }

      // Permanent failure.

      if (updatedJob.status === JOB_STATUS.FAILED) {
        this.stats.failed++;

        this.stats.permanentlyFailed++;

        this.stats.totalProcessed++;

        console.error(`[Job Worker] Job permanently failed: ${job.id}`);
      }

      return;
    }

    // Successful execution.

    const completedJob = this.queue.markCompleted(job.id, result);

    if (!completedJob) {
      console.error(`[Job Worker] Failed to complete job: ${job.id}`);

      return;
    }

    this.stats.completed++;

    this.stats.totalProcessed++;

    if (job.attempts > 1) {
      this.stats.recovered++;

      console.log(`[Job Worker] Job recovered after retry: ${job.id}`);
    }

    console.log(`[Job Worker] Job succeeded: ${job.id}`);
  }

  // ========================================
  // 4. GET WORKER STATISTICS
  // ========================================

  getStats() {
    return {
      isRunning: this.isRunning,
      isStopping: this.isStopping,

      concurrency: this.concurrency,

      activeJobs: this.activeJobs,

      availableSlots: Math.max(0, this.concurrency - this.activeJobs),

      pollIntervalMs: this.pollIntervalMs,

      delayedJobs: this.queue.getDelayedCount(),

      ...this.stats,
    };
  }

  // ========================================
  // 5. STOP WORKER GRACEFULLY
  // ========================================

  async stop() {
    if (this.stopPromise) {
      return this.stopPromise;
    }

    if (!this.isRunning && !this.isStopping) {
      return;
    }

    this.isStopping = true;

    this.isRunning = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);

      this.intervalHandle = null;
    }

    console.log("[Job Worker] Waiting for active jobs to finish...");

    this.stopPromise = this.finishStopping();

    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = null;

      this.isStopping = false;
    }
  }

  async finishStopping() {
    await Promise.allSettled(Array.from(this.inFlightJobs));

    console.log(
      `[Job Worker] Pending jobs remaining: ${this.queue.getPendingCount()}`,
    );

    console.log(
      `[Job Worker] Delayed retry jobs remaining: ${this.queue.getDelayedCount()}`,
    );

    console.log("[Job Worker] Worker stopped");
  }
}

// ==========================================
// SHARED WORKER INSTANCE
// ==========================================

const jobWorker = new JobWorker({
  concurrency: DEFAULT_CONCURRENCY,

  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
});

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  JobWorker,
  jobWorker,
};
