
const {
  jobQueue,
  JOB_STATUS,
  JOB_TYPES
} = require("../queues/jobQueue");

const {
  executeJob
} = require("./jobHandlers");

const {
  isRetryableError
} = require("../utils/jobErrors");

const {
  updateExportFailure
} = require("../services/exportJobService");

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

    if (
      !Number.isInteger(concurrency) ||
      concurrency < 1
    ) {
      throw new Error(
        "Concurrency must be a positive integer"
      );
    }

    if (
      !Number.isInteger(pollIntervalMs) ||
      pollIntervalMs < 1
    ) {
      throw new Error(
        "Poll interval must be a positive integer"
      );
    }

    if (typeof handler !== "function") {
      throw new TypeError(
        "Job handler must be a function"
      );
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

    // Worker statistics.

    this.stats = {

      totalProcessed: 0,
      completed: 0,
      failed: 0,

      totalAttempts: 0,
      failedAttempts: 0,

      retriesScheduled: 0,
      retryAttempts: 0,
      recovered: 0,
      permanentlyFailed: 0,

      maxConcurrentJobs: 0

    };

  }

  // ========================================
  // 1. START WORKER
  // ========================================

  start() {

    if (this.isRunning || this.isStopping) {

      console.log(
        "[Job Worker] Worker already running or stopping"
      );

      return false;

    }

    this.isRunning = true;

    console.log(
      "[Job Worker] Worker started"
    );

    console.log(
      `[Job Worker] Concurrency: ${this.concurrency}`
    );

    console.log(
      `[Job Worker] Poll interval: ${this.pollIntervalMs} ms`
    );

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

    while (
      this.activeJobs < this.concurrency
    ) {

      // Retrieve next available job.

      const job = this.queue.dequeue();

      if (!job) {
        break;
      }

      // Reserve worker execution slot.

      this.activeJobs++;

      this.stats.maxConcurrentJobs = Math.max(
        this.stats.maxConcurrentJobs,
        this.activeJobs
      );

      // Track complete asynchronous lifecycle.

      const jobPromise = this.processJob(job)

        .catch(async error => {

          console.error(

            "[Job Worker] Unexpected worker error:",

            error instanceof Error
              ? error.message
              : String(error)

          );

          const currentJob =
            this.queue.getJob(job.id);

          // Prevent unexpected errors from
          // leaving jobs in processing status.

          if (
            currentJob?.status === JOB_STATUS.PROCESSING
          ) {

            await this.syncExportFailure(
              currentJob,
              false
            );

            const failedJob =
              this.queue.markFailed(

                job.id,

                error,

                {
                  retryable: false
                }

              );

            if (
              failedJob?.status === JOB_STATUS.FAILED
            ) {

              this.stats.failed++;

              this.stats.permanentlyFailed++;

              this.stats.totalProcessed++;

            }

          }

        })

        .finally(() => {

          // Release slot after every attempt.

          this.activeJobs--;

          this.inFlightJobs.delete(
            jobPromise
          );

          if (
            this.isRunning &&
            !this.isStopping
          ) {

            setImmediate(() => {

              this.processQueue();

            });

          }

        });

      this.inFlightJobs.add(jobPromise);

    }

  }

  // ========================================
  // 3. SYNCHRONIZE EXPORT FAILURE STATUS
  // MILESTONE 10
  // ========================================

  async syncExportFailure(
    job,
    willRetry
  ) {

    // Existing notification and activity jobs
    // do not require export metadata updates.

    if (!job.payload?.exportId) {
      return;
    }

    const exportJobTypes = [

      JOB_TYPES.JSON_EXPORT,

      JOB_TYPES.CSV_EXPORT,

      JOB_TYPES.REPORT_GENERATION

    ];

    if (!exportJobTypes.includes(job.type)) {
      return;
    }

    try {

      await updateExportFailure(
        job,
        willRetry
      );

    } catch (metadataError) {

      // Keep the worker running even if
      // MongoDB metadata synchronization fails.

      console.error(

        "[Job Worker] Export metadata update failed:",

        metadataError.message

      );

    }

  }

  // ========================================
  // 4. PROCESS INDIVIDUAL JOB
  // ========================================

  async processJob(job) {

    console.log(
      `[Job Worker] Executing: ${job.type} | ${job.id}`
    );

    console.log(
      `[Job Worker] Attempt ${job.attempts}/${job.maxRetries + 1}`
    );

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

      // Determine if the failure is temporary.

      const retryable =
        isRetryableError(error);

      // Only operations designed for safe
      // repeated execution should be retried.

      const safeToRetry = [

        JOB_TYPES.NOTIFICATION,

        JOB_TYPES.ACTIVITY_LOG,

        JOB_TYPES.REPORT_GENERATION,

        // Milestone 10.

        JOB_TYPES.JSON_EXPORT,

        JOB_TYPES.CSV_EXPORT

      ].includes(job.type);

      const shouldRetry =
        retryable && safeToRetry;

      // Check whether more retries are available.

      const willRetry =

        shouldRetry &&

        job.retryCount < job.maxRetries;

      // ====================================
      // MILESTONE 10:
      // Persist retry or permanent failure
      // status in MongoDB.
      // ====================================

      await this.syncExportFailure(
        job,
        willRetry
      );

      // ====================================
      // MILESTONE 9:
      // Existing queue retry mechanism.
      // ====================================

      const updatedJob =
        this.queue.markFailed(

          job.id,

          error,

          {
            retryable: shouldRetry
          }

        );

      if (!updatedJob) {

        console.error(
          `[Job Worker] Failed to update job: ${job.id}`
        );

        return;

      }

      // ====================================
      // RETRY SCHEDULED
      // ====================================

      if (
        updatedJob.status === JOB_STATUS.RETRYING
      ) {

        this.stats.retriesScheduled++;

        console.log(
          `[Job Worker] Retry scheduled: ${job.id}`
        );

        console.log(
          `[Job Worker] Retry count: ${job.retryCount}/${job.maxRetries}`
        );

        // Release worker slot instead of
        // waiting during retry backoff.

        return;

      }

      // ====================================
      // PERMANENT FAILURE
      // ====================================

      if (
        updatedJob.status === JOB_STATUS.FAILED
      ) {

        this.stats.failed++;

        this.stats.permanentlyFailed++;

        this.stats.totalProcessed++;

        console.error(
          `[Job Worker] Job permanently failed: ${job.id}`
        );

      }

      return;

    }

    // ======================================
    // SUCCESSFUL EXECUTION
    // ======================================

    const completedJob =
      this.queue.markCompleted(

        job.id,

        result

      );

    if (!completedJob) {

      console.error(
        `[Job Worker] Failed to complete job: ${job.id}`
      );

      return;

    }

    this.stats.completed++;

    this.stats.totalProcessed++;

    // Track recovery after retry.

    if (job.attempts > 1) {

      this.stats.recovered++;

      console.log(
        `[Job Worker] Job recovered after retry: ${job.id}`
      );

    }

    console.log(
      `[Job Worker] Job succeeded: ${job.id}`
    );

  }

  // ========================================
  // 5. GET WORKER STATISTICS
  // ========================================

  getStats() {

    return {

      isRunning: this.isRunning,

      isStopping: this.isStopping,

      concurrency: this.concurrency,

      activeJobs: this.activeJobs,

      availableSlots: Math.max(

        0,

        this.concurrency - this.activeJobs

      ),

      pollIntervalMs: this.pollIntervalMs,

      delayedJobs: this.queue.getDelayedCount(),

      ...this.stats

    };

  }

  // ========================================
  // 6. STOP WORKER GRACEFULLY
  // ========================================

  async stop() {

    if (this.stopPromise) {

      return this.stopPromise;

    }

    if (
      !this.isRunning &&
      !this.isStopping
    ) {

      return;

    }

    this.isStopping = true;

    this.isRunning = false;

    if (this.intervalHandle) {

      clearInterval(
        this.intervalHandle
      );

      this.intervalHandle = null;

    }

    console.log(
      "[Job Worker] Waiting for active jobs to finish..."
    );

    this.stopPromise =
      this.finishStopping();

    try {

      await this.stopPromise;

    } finally {

      this.stopPromise = null;

      this.isStopping = false;

    }

  }

  // ========================================
  // 7. COMPLETE GRACEFUL SHUTDOWN
  // ========================================

  async finishStopping() {

    // Wait for all active jobs to settle.

    await Promise.allSettled(

      Array.from(this.inFlightJobs)

    );

    console.log(

      `[Job Worker] Pending jobs remaining: ${this.queue.getPendingCount()}`

    );

    console.log(

      `[Job Worker] Delayed retry jobs remaining: ${this.queue.getDelayedCount()}`

    );

    console.log(
      "[Job Worker] Worker stopped"
    );

  }

}

// ==========================================
// SHARED WORKER INSTANCE
// ==========================================

const jobWorker = new JobWorker({

  concurrency: DEFAULT_CONCURRENCY,

  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS

});

// ==========================================
// EXPORTS
// ==========================================

module.exports = {

  JobWorker,

  jobWorker

};
