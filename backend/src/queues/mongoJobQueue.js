const { randomUUID } = require("node:crypto");
const BackgroundJob = require("../models/backgroundJobModel");
const { calculateBackoff } = require("../utils/retry");
const { createError } = require("../utils/httpError");
const ACTIVE = ["pending", "processing", "retrying"];
const TYPES = ["notification", "activityLog", "reportGeneration", "jsonExport", "csvExport"];
const INTERACTIVE = ["reportGeneration", "jsonExport", "csvExport"];
const RETENTION_MS = 7 * 86400000;
// Single service instance. Atomic claims protect overlapping poll calls; startup recovery
// assumes no other process is executing jobs against this database.
class MongoJobQueue {
  constructor({ Model = BackgroundJob, maxActiveJobs = 1000, maxUserJobs = 20, maxInteractiveJobs = 800 } = {}) {
    this.Model = Model;
    this.persistent = true;
    this.maxActiveJobs = maxActiveJobs;
    this.maxUserJobs = maxUserJobs;
    this.maxInteractiveJobs = maxInteractiveJobs;
    this.serial = Promise.resolve();
  }
  enqueue(type, payload, userId = null, options = {}) {
    // Serialize admission checks within the supported single-instance deployment.
    const operation = this.serial.then(() => this.insert(type, payload, userId, options));
    this.serial = operation.catch(() => {});
    return operation;
  }
  async insert(type, payload, userId, options) {
    if (!TYPES.includes(type) || !payload || typeof payload !== "object" || Array.isArray(payload)) throw createError("Invalid job payload");
    const id = options.jobId ?? randomUUID();
    if (typeof id !== "string" || !id.trim() || id.length > 100) throw createError("Invalid job ID");
    const owner = userId == null ? null : String(userId);
    const filter = { status: { $in: ACTIVE } };
    if (await this.Model.exists({ id })) throw createError("Job ID already exists", 409);
    if (await this.Model.countDocuments(filter) >= this.maxActiveJobs) throw createError("Job queue is full", 503);
    if (INTERACTIVE.includes(type)) {
      if (await this.Model.countDocuments({ ...filter, type: { $in: INTERACTIVE }, userId: owner }) >= this.maxUserJobs) throw createError("Too many active exports for this user", 429);
      if (await this.Model.countDocuments({ ...filter, type: { $in: INTERACTIVE } }) >= this.maxInteractiveJobs) throw createError("Export queue is full", 503);
    }
    try {
      const row = await this.Model.create({ id, type, userId: owner, payload, priority: INTERACTIVE.includes(type) ? 1 : 0, status: "pending", result: null, error: null, attempts: 0, maxRetries: 3, retryCount: 0, retryDelay: 1000, nextRetryAt: null, errorHistory: [], isPermanentlyFailed: false, createdAt: new Date(), startedAt: null, lastAttemptAt: null, completedAt: null, failedAt: null });
      return row.toObject();
    } catch (error) {
      if (error.code === 11000) throw createError("Job ID already exists", 409);
      throw error;
    }
  }
  async dequeue() {
    const now = new Date();
    // Atomic MongoDB claim; retry jobs become eligible only after their delay.
    return this.Model.findOneAndUpdate({ $or: [{ status: "pending" }, { status: "retrying", nextRetryAt: { $lte: now } }] }, [
      { $set: { status: "processing", attempts: { $add: ["$attempts", 1] }, startedAt: { $ifNull: ["$startedAt", now] }, lastAttemptAt: now, nextRetryAt: null } },
    ], { sort: { priority: 1, createdAt: 1, _id: 1 }, returnDocument: "after", updatePipeline: true }).lean();
  }
  async markCompleted(id, result = null) {
    const now = new Date();
    return this.Model.findOneAndUpdate({ id, status: "processing" }, { $set: { status: "completed", result, error: null, nextRetryAt: null, failedAt: null, isPermanentlyFailed: false, completedAt: now, expiresAt: new Date(now.getTime() + RETENTION_MS) } }, { returnDocument: "after" }).lean();
  }
  async markFailed(id, error, { retryable = true } = {}) {
    const job = await this.getJob(id);
    if (!job || job.status !== "processing") return null;
    const now = new Date();
    const message = "Job attempt failed"; // No raw payloads or DB errors stored in job history.
    const canRetry = retryable && job.retryCount < job.maxRetries;
    const patch = { error: message, lastError: message, result: null, status: canRetry ? "retrying" : "failed", isPermanentlyFailed: !canRetry, retryCount: job.retryCount + (canRetry ? 1 : 0), nextRetryAt: canRetry ? new Date(now.getTime() + calculateBackoff(job.retryDelay, job.retryCount + 1)) : null, completedAt: canRetry ? null : now, failedAt: canRetry ? null : now, expiresAt: canRetry ? null : new Date(now.getTime() + RETENTION_MS) };
    return this.Model.findOneAndUpdate({ id, status: "processing", attempts: job.attempts }, { $set: patch, $push: { errorHistory: { attempt: job.attempts, name: error?.name || "Error", message, timestamp: now, retryable } } }, { returnDocument: "after" }).lean();
  }
  getJob(id) { return this.Model.findOne({ id }).lean(); }
  getPendingCount() { return this.Model.countDocuments({ status: "pending" }); }
  getDelayedCount() { return this.Model.countDocuments({ status: "retrying" }); }
  async recoverInterrupted(onFailure) {
    for await (const job of this.Model.find({ status: "processing" }).lean().cursor()) {
      // All currently supported handlers have idempotent writes or fixed output names.
      const retryable = job.retryCount < job.maxRetries;
      if (onFailure) await onFailure(job, retryable);
      await this.markFailed(job.id, new Error("Interrupted process"), { retryable });
    }
  }
  async list(filter, { skip, limit }) {
    const [jobs, total] = await Promise.all([this.Model.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), this.Model.countDocuments(filter)]);
    return { jobs, total };
  }
  async statistics(filter) {
    const rows = await this.Model.aggregate([{ $match: filter }, { $group: {
      _id: "$status", count: { $sum: 1 }, totalAttempts: { $sum: "$attempts" }, totalRetriesScheduled: { $sum: "$retryCount" }, totalRetryAttempts: { $sum: { $max: [0, { $subtract: ["$attempts", 1] }] } }, failedAttempts: { $sum: { $size: { $ifNull: ["$errorHistory", []] } } }, retriedJobs: { $sum: { $cond: [{ $gt: ["$retryCount", 0] }, 1, 0] } }, recoveredJobs: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "completed"] }, { $gt: ["$attempts", 1] }] }, 1, 0] } }, permanentlyFailedJobs: { $sum: { $cond: ["$isPermanentlyFailed", 1, 0] } },
    } }]);
    const queue = { total: 0, pending: 0, processing: 0, retrying: 0, completed: 0, failed: 0 };
    const retries = { totalAttempts: 0, totalRetriesScheduled: 0, totalRetryAttempts: 0, failedAttempts: 0, retriedJobs: 0, recoveredJobs: 0, permanentlyFailedJobs: 0, awaitingRetry: 0 };
    for (const row of rows) { queue[row._id] = row.count; queue.total += row.count; for (const key of Object.keys(retries)) if (key !== "awaitingRetry") retries[key] += row[key] || 0; }
    retries.awaitingRetry = queue.retrying;
    return { queue, retries };
  }
}
module.exports = { MongoJobQueue };
