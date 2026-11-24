const { randomUUID } = require("node:crypto");
const Task = require("../models/taskModel");
const { jobQueue } = require("../queues/jobQueue");
const { activityJob } = require("./taskActivityListener");
const { notificationJob } = require("./taskNotificationListener");
const emitter = require("./taskEventEmitter");
const logger = require("../utils/logger");

// The event is stored in the same MongoDB document as the mutation; this works
// with a standalone MongoDB without requiring multi-document transactions.
function makeEvent(eventType, task, actor, details = {}) {
  return { id: randomUUID(), eventType, data: { taskId: String(task._id), performedBy: String(actor), details, title: task.title, recipient: String(task.assignedTo || task.createdBy) } };
}
async function deliver(job) {
  if (!job) return;
  try { await jobQueue.enqueue(job.type, job.payload, job.userId, { jobId: job.id }); }
  catch (error) {
    // Crash after enqueue and before pulling the event is safe: the same job ID
    // is accepted only if the existing job has the same owner and type.
    if (error.statusCode !== 409) throw error;
    const existing = await jobQueue.getJob(job.id);
    if (!existing || existing.type !== job.type || existing.userId !== job.userId) throw error;
  }
}
const flushing = new Map();
async function flushTaskEvents(taskId) {
  const key = String(taskId);
  if (flushing.has(key)) return flushing.get(key);
  const operation = (async () => {
    const task = await Task.findById(taskId).select("+pendingEvents").lean();
    for (const event of task?.pendingEvents || []) {
      try {
        await deliver(activityJob(event));
        await deliver(notificationJob(event));
        await Task.updateOne({ _id: taskId }, { $pull: { pendingEvents: { id: event.id } } }, { timestamps: false });
        // Retain EventEmitter for development observers, never as the delivery mechanism.
        try { emitter.emit(event.eventType, event.data); } catch (error) { logger.error("Task event observer failed", error); }
      } catch (error) {
        logger.error("Outbox delivery deferred", error);
        break; // Keep event persisted; scheduler will retry.
      }
    }
  })();
  flushing.set(key, operation);
  try { await operation; } finally { flushing.delete(key); }
}
let interval, sweep;
function pollOutbox() {
  if (sweep) return sweep;
  sweep = (async () => {
    // Process a bounded page; each task is isolated from delivery failures.
    const tasks = await Task.find({ "pendingEvents.id": { $exists: true } }).sort({ updatedAt: 1, _id: 1 }).select("_id").limit(100).lean();
    for (const task of tasks) { try { await flushTaskEvents(task._id); } catch (error) { logger.error("Outbox task failed", error); } }
  })().catch(error => logger.error("Outbox sweep failed", error)).finally(() => { sweep = null; });
  return sweep;
}
function startOutbox() { if (!interval) { interval = setInterval(pollOutbox, 2000); interval.unref(); void pollOutbox(); } }
async function stopOutbox() { clearInterval(interval); interval = null; await sweep; await Promise.allSettled([...flushing.values()]); }
async function flushBestEffort(id) { try { await flushTaskEvents(id); } catch (error) { logger.error("Outbox delivery deferred", error); } }
module.exports = { makeEvent, flushTaskEvents, flushBestEffort, startOutbox, stopOutbox };
