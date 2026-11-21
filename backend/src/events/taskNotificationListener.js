
const taskEventEmitter = require("./taskEventEmitter");
const Task = require("../models/taskModel");

const {
  createNotification,
} = require("../services/notificationService");

// ==========================================
// HELPER — HANDLE NOTIFICATION ERRORS
// ==========================================

const handleNotification = async (callback) => {
  try {
    await callback();
  } catch (error) {
    console.error(
      "[Notification Error]",
      error.message
    );
  }
};

// ==========================================
// 1. TASK ASSIGNED
// ==========================================

taskEventEmitter.on("taskAssigned", (data) => {
  void handleNotification(async () => {
    const assignedTo = data.details?.assignedTo;
    const previousAssignee =
      data.details?.previousAssignee;

    if (!assignedTo) return;

    // Avoid notifying when the assignee is unchanged.
    if (
      previousAssignee?.toString() ===
      assignedTo.toString()
    ) {
      return;
    }

    await createNotification({
      user: assignedTo,
      task: data.taskId,
      type: "taskAssigned",
      message: "You have been assigned a task.",
    });

    console.log("Assignment notification created");
  });
});

// ==========================================
// 2. TASK COMPLETED
// ==========================================

taskEventEmitter.on("taskCompleted", (data) => {
  void handleNotification(async () => {
    const task = await Task.findById(data.taskId);

    if (!task) return;

    // Notify assignee, or creator if unassigned.
    const recipient = task.assignedTo || task.createdBy;

    await createNotification({
      user: recipient,
      task: task._id,
      type: "taskCompleted",
      message: `Task "${task.title}" has been completed.`,
    });

    console.log("Completion notification created");
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

    // Ignore updates without a priority change.
    if (
      previousPriority === undefined ||
      newPriority === undefined ||
      previousPriority === newPriority
    ) {
      return;
    }

    const task = await Task.findById(data.taskId);

    if (!task) return;

    const recipient = task.assignedTo || task.createdBy;

    await createNotification({
      user: recipient,
      task: task._id,
      type: "priorityChanged",
      message:
        `Task "${task.title}" priority changed ` +
        `from ${previousPriority} to ${newPriority}.`,
    });

    console.log("Priority notification created");
  });
});
