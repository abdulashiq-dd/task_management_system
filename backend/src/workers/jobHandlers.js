
const mongoose = require("mongoose");

const { JOB_TYPES } = require("../queues/jobQueue");

const notificationService = require(
  "../services/notificationService"
);

const dashboardService = require(
  "../services/dashboardService"
);

const TaskActivity = require(
  "../models/taskActivityModel"
);

// ==========================================
// CONFIGURATION
// ==========================================

const REPORT_DELAY_MS = 5000;

const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ==========================================
// 1. NOTIFICATION JOB HANDLER
// ==========================================

async function handleNotificationJob(payload) {
  const { user, task, type, message } = payload;

  if (
    !mongoose.isValidObjectId(user) ||
    !mongoose.isValidObjectId(task) ||
    !type ||
    !message
  ) {
    throw new Error(
      "Invalid notification job payload"
    );
  }

  console.log(
    "[Job Handler] Creating notification..."
  );

  const notification =
    await notificationService.createNotification({
      user,
      task,
      type,
      message,
    });

  return {
    notificationId: String(notification._id),
    type: notification.type,
    message: "Notification created successfully",
  };
}

// ==========================================
// 2. ACTIVITY LOG JOB HANDLER
// ==========================================

async function handleActivityLogJob(payload) {
  const {
    task,
    eventType,
    performedBy,
    details = {},
  } = payload;

  if (
    !mongoose.isValidObjectId(task) ||
    !mongoose.isValidObjectId(performedBy) ||
    !eventType
  ) {
    throw new Error(
      "Invalid activity log job payload"
    );
  }

  console.log(
    "[Job Handler] Creating activity log..."
  );

  const activity = await TaskActivity.create({
    task,
    eventType,
    performedBy,
    details,
  });

  return {
    activityId: String(activity._id),
    eventType: activity.eventType,
    message: "Activity log created successfully",
  };
}

// ==========================================
// 3. REPORT GENERATION JOB HANDLER
// ==========================================

async function handleReportGenerationJob(payload) {
  const { reportType, currentUser } = payload;

  if (reportType !== "taskSummary") {
    throw new Error(
      `Unsupported report type: ${reportType}`
    );
  }

  if (
    !currentUser ||
    !mongoose.isValidObjectId(currentUser.id) ||
    !currentUser.role
  ) {
    throw new Error(
      "Valid authenticated user is required"
    );
  }

  console.log(
    "[Job Handler] Generating task summary report..."
  );

  // Simulate slow asynchronous background work.
  await delay(REPORT_DELAY_MS);

  // Reuse existing Milestone 6 dashboard service.
  const dashboard =
    await dashboardService.getDashboardStats({
      id: currentUser.id,
      role: currentUser.role,
    });

  console.log(
    "[Job Handler] Report generation completed"
  );

  return {
    reportType,
    generatedAt: new Date().toISOString(),
    totalTasks: dashboard.totalTasks,
    completedTasks: dashboard.completedTasks,
    pendingTasks: dashboard.pendingTasks,
    overdueTasks: dashboard.overdueTasks,
    tasksByPriority: dashboard.tasksByPriority,
  };
}

// ==========================================
// 4. JOB TYPE DISPATCHER
// ==========================================

async function executeJob(job) {
  if (
    !job ||
    !job.type ||
    !job.payload ||
    typeof job.payload !== "object" ||
    Array.isArray(job.payload)
  ) {
    throw new Error("Invalid job");
  }

  switch (job.type) {
    case JOB_TYPES.NOTIFICATION:
      return handleNotificationJob(job.payload);

    case JOB_TYPES.ACTIVITY_LOG:
      return handleActivityLogJob(job.payload);

    case JOB_TYPES.REPORT_GENERATION:
      return handleReportGenerationJob(job.payload);

    default:
      throw new Error(
        `Unsupported job type: ${job.type}`
      );
  }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  handleNotificationJob,
  handleActivityLogJob,
  handleReportGenerationJob,
  executeJob,
};
