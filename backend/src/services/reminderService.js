
const Task = require("../models/taskModel");
const Notification = require("../models/notificationModel");
const logger = require("../utils/logger");

// Reminder window: 24 hours
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

// ==========================================
// 1. GET UPCOMING TASKS
// ==========================================

const getUpcomingTasks = (now = new Date()) => {
  const reminderDeadline = new Date(
    now.getTime() + REMINDER_WINDOW_MS
  );

  return Task.find({
    status: {
      $in: ["pending", "in_progress"],
    },
    dueDate: {
      $gt: now,
      $lte: reminderDeadline,
    },
  }).lean();
};

// ==========================================
// 2. GET OVERDUE TASKS
// ==========================================

const getOverdueTasks = (now = new Date()) => {
  return Task.find({
    status: {
      $in: ["pending", "in_progress"],
    },
    isOverdue: { $ne: true },
    dueDate: {
      $ne: null,
      $lte: now,
    },
  }).lean();
};

// ==========================================
// 3. CREATE UNIQUE NOTIFICATION
// ==========================================

const createReminderNotification = async (
  task,
  type
) => {
  // Notify the assignee or fall back to creator.
  const userId = task.assignedTo || task.createdBy;

  if (!userId || !task.dueDate) {
    return false;
  }

  const dueDate = new Date(task.dueDate);

  const deduplicationKey =
    `${task._id}:${userId}:${type}:${dueDate.toISOString()}`;

  const message =
    type === "taskReminder"
      ? `Reminder: "${task.title}" is due soon.`
      : `Task "${task.title}" is overdue.`;

  try {
    await Notification.create({
      user: userId,
      task: task._id,
      type,
      message,
      isRead: false,
      reminderDueDate: dueDate,
      deduplicationKey,
    });

    logger.info(`Reminder created: ${type}`);

    return true;
  } catch (error) {
    // MongoDB duplicate key error.
    if (error.code === 11000) {
      return false;
    }

    throw error;
  }
};

// ==========================================
// 4. PROCESS UPCOMING TASKS
// ==========================================

const processUpcomingTasks = async (now) => {
  const tasks = getUpcomingTasks(now).cursor({ batchSize: 100 });
  let upcomingTasks = 0;

  let remindersCreated = 0;

  for await (const task of tasks) {
    upcomingTasks++;
    const created = await createReminderNotification(
      task,
      "taskReminder"
    );

    if (created) {
      remindersCreated++;
    }
  }

  return {
    upcomingTasks,
    remindersCreated,
  };
};

// ==========================================
// 5. PROCESS OVERDUE TASKS
// ==========================================

const processOverdueTasks = async (now) => {
  const tasks = getOverdueTasks(now).cursor({ batchSize: 100 });
  let overdueTasks = 0, newlyOverdue = 0, overdueNotificationsCreated = 0;
  for await (const task of tasks) {
    overdueTasks++;
    const filter = { _id: task._id, status: { $in: ["pending", "in_progress"] }, dueDate: task.dueDate, assignedTo: task.assignedTo || null, isOverdue: { $ne: true } };
    const currentTask = await Task.findOne(filter).lean();
    if (!currentTask) continue;
    // A notification failure must leave the task eligible on the next sweep.
    // If the following update fails, the unique reminder key prevents duplicates.
    if (await createReminderNotification(currentTask, "taskOverdue")) overdueNotificationsCreated++;
    const result = await Task.updateOne(filter, { $set: { isOverdue: true, overdueAt: now } });
    newlyOverdue += result.modifiedCount;
  }
  return { overdueTasks, newlyOverdue, overdueNotificationsCreated };
};

// ==========================================
// 6. RESET OVERDUE FLAGS
// ==========================================

const resetOverdueTasks = async (now) => {
  const result = await Task.updateMany(
    {
      isOverdue: true,
      $or: [
        { status: "completed" },
        { dueDate: { $gt: now } },
        { dueDate: null },
      ],
    },
    {
      $set: {
        isOverdue: false,
        overdueAt: null,
      },
    }
  );

  return result.modifiedCount;
};

// ==========================================
// 7. RUN REMINDER CHECK
// ==========================================

const runReminderCheck = async () => {
  const now = new Date();

  logger.info("[Reminder] Check started: [redacted]");

  // Reset flags before processing tasks.
  const overdueFlagsReset = await resetOverdueTasks(now);

  // Wait for both operations, even if one fails.
  const results = await Promise.allSettled([
    processUpcomingTasks(now),
    processOverdueTasks(now),
  ]);

  const [upcomingResult, overdueResult] = results;

  const summary = {
    checkedAt: now.toISOString(),
    overdueFlagsReset,
    upcoming:
      upcomingResult.status === "fulfilled"
        ? upcomingResult.value
        : null,
    overdue:
      overdueResult.status === "fulfilled"
        ? overdueResult.value
        : null,
    errors: results
      .filter((result) => result.status === "rejected")
      .map((result) => { logger.error("Reminder operation failed", result.reason); return "Reminder operation failed"; }),
  };

  logger.info("Reminder check completed");

  return summary;
};

// ==========================================
// EXPORT SERVICES
// ==========================================

module.exports = {
  getUpcomingTasks,
  getOverdueTasks,
  processUpcomingTasks,
  processOverdueTasks,
  resetOverdueTasks,
  runReminderCheck,
};
