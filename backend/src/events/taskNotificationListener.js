
const taskEventEmitter = require("./taskEventEmitter");

const Task = require("../models/taskModel");

const {
  jobQueue,
  JOB_TYPES,
} = require("../queues/jobQueue");

// ==========================================
// HELPER - HANDLE NOTIFICATION ERRORS
// ==========================================

const handleNotification = async (callback) => {
  try {
    await callback();
  } catch (error) {
    console.error(
      "[Notification Queue Error]",
      error.message
    );
  }
};

// ==========================================
// HELPER - ENQUEUE NOTIFICATION
// ==========================================

function queueNotification({
  user,
  task,
  type,
  message,
}) {
  if (!user || !task || !type || !message) {
    throw new Error(
      "Notification details are required"
    );
  }

  const job = jobQueue.enqueue(
    JOB_TYPES.NOTIFICATION,
    {
      user: String(user),
      task: String(task),
      type,
      message,
    },
    String(user)
  );

  console.log(
    `[Notification Listener] ${type} queued: ${job.id}`
  );

  return job;
}

// ==========================================
// 1. TASK ASSIGNED
// ==========================================

taskEventEmitter.on("taskAssigned", (data) => {
  void handleNotification(async () => {
    const assignedTo = data.details?.assignedTo;

    const previousAssignee =
      data.details?.previousAssignee;

    if (!assignedTo) return;

    // Avoid duplicate assignment notifications.
    if (
      previousAssignee?.toString() ===
      assignedTo.toString()
    ) {
      return;
    }

    queueNotification({
      user: assignedTo,
      task: data.taskId,
      type: "taskAssigned",
      message: "You have been assigned a task.",
    });
  });
});

// ==========================================
// 2. TASK COMPLETED
// ==========================================

taskEventEmitter.on("taskCompleted", (data) => {
  void handleNotification(async () => {
    const task = await Task.findById(
      data.taskId
    );

    if (!task) return;

    // Notify assignee or creator if unassigned.
    const recipient =
      task.assignedTo || task.createdBy;

    queueNotification({
      user: recipient,
      task: task._id,
      type: "taskCompleted",
      message:
        `Task "${task.title}" has been completed.`,
    });
  });
});

// ==========================================
// 3. TASK PRIORITY CHANGED
// ==========================================

taskEventEmitter.on("taskUpdated", (data) => {
  void handleNotification(async () => {
    const {
      previousPriority,
      newPriority,
    } = data.details || {};

    // Ignore updates without priority changes.
    if (
      previousPriority === undefined ||
      newPriority === undefined ||
      previousPriority === newPriority
    ) {
      return;
    }

    const task = await Task.findById(
      data.taskId
    );

    if (!task) return;

    const recipient =
      task.assignedTo || task.createdBy;

    queueNotification({
      user: recipient,
      task: task._id,
      type: "priorityChanged",
      message:
        `Task "${task.title}" priority changed ` +
        `from ${previousPriority} to ${newPriority}.`,
    });
  });
});

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  queueNotification,
};
