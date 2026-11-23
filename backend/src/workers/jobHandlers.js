
const mongoose = require("mongoose");

const {
  JOB_TYPES,
} = require("../queues/jobQueue");

const notificationService = require(
  "../services/notificationService"
);

const dashboardService = require(
  "../services/dashboardService"
);

const TaskActivity = require(
  "../models/taskActivityModel"
);

const {
  createIdempotent,
} = require("../utils/idempotentWrite");

const {
  NonRetryableError,
} = require("../utils/jobErrors");

const {
  sleep,
} = require("../utils/retry");

// ==========================================
// CONFIGURATION
// ==========================================

const REPORT_DELAY_MS = 5000;

// ==========================================
// 1. NOTIFICATION JOB HANDLER
// ==========================================

async function handleNotificationJob(
  payload,
  backgroundJobId
) {
  const {
    user,
    task,
    type,
    message,
  } = payload;

  if (
    !mongoose.isValidObjectId(user) ||
    !mongoose.isValidObjectId(task) ||
    !type ||
    !message
  ) {
    throw new NonRetryableError(
      "Invalid notification job payload"
    );
  }

  if (
    typeof backgroundJobId !== "string" ||
    !backgroundJobId.trim()
  ) {
    throw new NonRetryableError(
      "Valid background job ID is required"
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
      backgroundJobId,
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

async function handleActivityLogJob(
  payload,
  backgroundJobId
) {
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
    throw new NonRetryableError(
      "Invalid activity log job payload"
    );
  }

  console.log(
    "[Job Handler] Creating activity log..."
  );

  const activity = await createIdempotent(
    TaskActivity,
    backgroundJobId,
    {
      task,
      eventType,
      performedBy,
      details,
    }
  );

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

  const {
    reportType,
    currentUser,
  } = payload;

  if (reportType !== "taskSummary") {

    throw new NonRetryableError(
      `Unsupported report type: ${reportType}`
    );
  }

  if (
    !currentUser ||
    !mongoose.isValidObjectId(currentUser.id) ||
    !["user", "admin"].includes(currentUser.role)
  ) {
    throw new NonRetryableError(
      "Valid authenticated user is required"
    );
  }

  console.log(
    "[Job Handler] Generating task summary report..."
  );

  await sleep(REPORT_DELAY_MS);

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
    typeof job.id !== "string" ||
    !job.id.trim() ||
    !job.type ||
    !job.payload ||
    typeof job.payload !== "object" ||
    Array.isArray(job.payload)
  ) {
    throw new NonRetryableError("Invalid job");
  }

  switch (job.type) {

    case JOB_TYPES.NOTIFICATION:

      return handleNotificationJob(
        job.payload,
        job.id
      );

    case JOB_TYPES.ACTIVITY_LOG:

      return handleActivityLogJob(
        job.payload,
        job.id
      );

    case JOB_TYPES.REPORT_GENERATION:

      return handleReportGenerationJob(
        job.payload
      );

    default:

      throw new NonRetryableError(
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
