
const { jobQueue } = require("../queues/jobQueue");

const { executeJob } = require("./jobHandlers");

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

    this.queue = queue;
    this.handler = handler;
    this.concurrency = concurrency;
    this.pollIntervalMs = pollIntervalMs;

    this.isRunning = false;
    this.isStopping = false;
    this.activeJobs = 0;

    this.intervalHandle = null;

    // Track currently executing jobs.
    this.inFlightJobs = new Set();

    this.stats = {
      totalProcessed: 0,
      completed: 0,
      failed: 0,
      maxConcurrentJobs: 0,
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

    console.log("[Job Worker] Worker started");

    console.log(
      `[Job Worker] Concurrency: ${this.concurrency}`
    );

    console.log(
      `[Job Worker] Poll interval: ${this.pollIntervalMs} ms`
    );

    // Check the queue periodically.
    this.intervalHandle = setInterval(() => {
      this.processQueue();
    }, this.pollIntervalMs);

    // Process existing jobs immediately.
    this.processQueue();

    return true;
  }

  // ========================================
  // 2. CHECK QUEUE AND AVAILABLE CAPACITY
  // ========================================

  processQueue() {
    if (!this.isRunning || this.isStopping) {
      return;
    }

    while (this.activeJobs < this.concurrency) {
      const job = this.queue.dequeue();

      if (!job) {
        break;
      }

      // Reserve the worker slot synchronously.
      this.activeJobs++;

      this.stats.maxConcurrentJobs = Math.max(
        this.stats.maxConcurrentJobs,
        this.activeJobs
      );

      // Start asynchronous job processing.
      const jobPromise = this.processJob(job);

      this.inFlightJobs.add(jobPromise);

      // Release the worker slot when the job settles.
      jobPromise
        .catch((error) => {
          console.error(
            "[Job Worker] Unexpected worker error:",
            error.message
          );
        })
        .finally(() => {
          this.activeJobs--;

          this.inFlightJobs.delete(jobPromise);

          // Continue consuming available jobs.
          if (this.isRunning && !this.isStopping) {
            setImmediate(() => {
              this.processQueue();
            });
          }
        });
    }
  }

  // ========================================
  // 3. PROCESS INDIVIDUAL JOB
  // ========================================

  async processJob(job) {
    console.log(
      `[Job Worker] Executing: ${job.type} | ${job.id}`
    );

    try {
      const result = await this.handler(job);

      this.queue.markCompleted(job.id, result);

      this.stats.completed++;

      console.log(
        `[Job Worker] Job succeeded: ${job.id}`
      );
    } catch (error) {
      this.queue.markFailed(job.id, error);

      this.stats.failed++;

      console.error(
        `[Job Worker] Job failed: ${job.id}`
      );
    } finally {
      this.stats.totalProcessed++;
    }
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
      availableSlots: Math.max(
        0,
        this.concurrency - this.activeJobs
      ),
      pollIntervalMs: this.pollIntervalMs,
      ...this.stats,
    };
  }

  // ========================================
  // 5. STOP WORKER GRACEFULLY
  // ========================================

  async stop() {
    if (!this.isRunning && !this.isStopping) {
      return;
    }

    this.isStopping = true;
    this.isRunning = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);

      this.intervalHandle = null;
    }

    console.log(
      "[Job Worker] Waiting for active jobs to finish..."
    );

    // Wait for all currently executing jobs.
    // Pending jobs will remain in queue memory.
    await Promise.allSettled(
      Array.from(this.inFlightJobs)
    );

    this.isStopping = false;

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
