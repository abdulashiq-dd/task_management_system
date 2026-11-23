
const Task = require("../models/taskModel");
const Notification = require("../models/notificationModel");

// Reminder window: 24 hours
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

// ==========================================
// 1. GET UPCOMING TASKS
// ==========================================

const getUpcomingTasks = async (now = new Date()) => {
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

const getOverdueTasks = async (now = new Date()) => {
  return Task.find({
    status: {
      $in: ["pending", "in_progress"],
    },
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

    console.log(
      `[Reminder] ${type} created: ${task.title}`
    );

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
  const tasks = await getUpcomingTasks(now);

  let remindersCreated = 0;

  for (const task of tasks) {
    const created = await createReminderNotification(
      task,
      "taskReminder"
    );

    if (created) {
      remindersCreated++;
    }
  }

  return {
    upcomingTasks: tasks.length,
    remindersCreated,
  };
};

// ==========================================
// 5. PROCESS OVERDUE TASKS
// ==========================================

const processOverdueTasks = async (now) => {
  const tasks = await getOverdueTasks(now);

  let newlyOverdue = 0;
  let overdueNotificationsCreated = 0;

  for (const task of tasks) {
    // Mark overdue only if the task still qualifies.
    const result = await Task.updateOne(
      {
        _id: task._id,
        status: {
          $in: ["pending", "in_progress"],
        },
        dueDate: task.dueDate,
        isOverdue: { $ne: true },
      },
      {
        $set: {
          isOverdue: true,
          overdueAt: now,
        },
      }
    );

    if (result.modifiedCount > 0) {
      newlyOverdue++;

      console.log(
        `[Reminder] Task marked overdue: ${task.title}`
      );
    }

    // Recheck eligibility before creating a notification.
    const currentTask = await Task.findOne({
      _id: task._id,
      status: {
        $in: ["pending", "in_progress"],
      },
      dueDate: task.dueDate,
      isOverdue: true,
    }).lean();

    if (!currentTask) {
      continue;
    }

    const created = await createReminderNotification(
      currentTask,
      "taskOverdue"
    );

    if (created) {
      overdueNotificationsCreated++;
    }
  }

  return {
    overdueTasks: tasks.length,
    newlyOverdue,
    overdueNotificationsCreated,
  };
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

  console.log(
    `[Reminder] Check started: ${now.toISOString()}`
  );

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
      .map((result) => result.reason.message),
  };

  console.log("[Reminder] Check completed:", summary);

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
