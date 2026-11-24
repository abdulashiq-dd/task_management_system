const logger = require("../utils/logger");

const mongoose = require("mongoose");
const { runtimeUser } = require("../utils/runtimeUser");

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
  JOB_TYPES
} = require("../queues/jobQueue");

const {
  createIdempotent
} = require("../utils/idempotentWrite");

const {
  NonRetryableError
} = require("../utils/jobErrors");



const {
  processExportJob
} = require("../services/exportJobService");

const {
  FILE_TYPES
} = require("../config/fileStorage");

// ==========================================
// CONFIGURATION
// ==========================================



// ==========================================
// 1. NOTIFICATION JOB HANDLER
// MILESTONE 5, 8 AND 9
// ==========================================

async function handleNotificationJob(
  payload,
  backgroundJobId
) {

  const {
    user,
    task,
    type,
    message
  } = payload;

  if (
    !mongoose.isValidObjectId(user) ||
    !mongoose.isValidObjectId(task) ||
    typeof type !== "string" || !["taskAssigned", "taskCompleted", "priorityChanged", "taskReminder", "taskOverdue"].includes(type) ||
    typeof message !== "string" || !message.trim() || message.length > 4096
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

  logger.info("[Job Handler] Creating notification...");

  const notification =
    await notificationService.createNotification({

      user,

      task,

      type,

      message,

      backgroundJobId

    });

  return {

    notificationId: String(notification._id),

    type: notification.type,

    message: "Notification created successfully"

  };

}

// ==========================================
// 2. ACTIVITY LOG JOB HANDLER
// MILESTONE 4, 8 AND 9
// ==========================================

async function handleActivityLogJob(
  payload,
  backgroundJobId
) {

  const {

    task,

    eventType,

    performedBy,

    details = {}

  } = payload;

  if (

    !mongoose.isValidObjectId(task) ||

    !mongoose.isValidObjectId(performedBy) ||

    typeof eventType !== "string" || !["taskCreated", "taskUpdated", "taskAssigned", "taskCompleted"].includes(eventType)

  ) {

    throw new NonRetryableError(
      "Invalid activity log job payload"
    );

  }

  logger.info("[Job Handler] Creating activity log...");

  const activity = await createIdempotent(

    TaskActivity,

    backgroundJobId,

    {

      task,

      eventType,

      performedBy,

      details

    }

  );

  return {

    activityId: String(activity._id),

    eventType: activity.eventType,

    message: "Activity log created successfully"

  };

}

// ==========================================
// 3. EXISTING REPORT GENERATION HANDLER
// MILESTONE 8 AND 9
// ==========================================

async function handleReportGenerationJob(
  payload
) {

  const {

    reportType,

    currentUser

  } = payload;

  if (reportType !== "taskSummary") {

    throw new NonRetryableError(
      `Unsupported report type: ${reportType}`
    );

  }

  if (

    !currentUser ||

    !mongoose.isValidObjectId(currentUser.id)

  ) {

    throw new NonRetryableError(
      "Valid authenticated user is required"
    );

  }

  logger.info("[Job Handler] Generating task summary report...");

  const authorizedUser = await runtimeUser(currentUser.id);

  const dashboard =
    await dashboardService.getDashboardStats({

      id: authorizedUser.id,

      role: authorizedUser.role

    });

  logger.info("[Job Handler] Report generation completed");

  return {

    reportType,
    generatedRole: authorizedUser.role,

    generatedAt: new Date().toISOString(),

    totalTasks: dashboard.totalTasks,

    completedTasks: dashboard.completedTasks,

    pendingTasks: dashboard.pendingTasks,

    overdueTasks: dashboard.overdueTasks,

    tasksByPriority: dashboard.tasksByPriority

  };

}

// ==========================================
// 4. JSON EXPORT JOB HANDLER
// MILESTONE 10
// ==========================================

async function handleJSONExportJob(job) {

  logger.info("[Job Handler] Processing JSON export...");

  return processExportJob(

    job,

    FILE_TYPES.JSON

  );

}

// ==========================================
// 5. CSV EXPORT JOB HANDLER
// MILESTONE 10
// ==========================================

async function handleCSVExportJob(job) {

  logger.info("[Job Handler] Processing CSV export...");

  return processExportJob(

    job,

    FILE_TYPES.CSV

  );

}

// ==========================================
// 6. DOWNLOADABLE REPORT JOB HANDLER
// MILESTONE 10
// ==========================================

async function handleReportExportJob(job) {

  if (
    job.payload.reportType !== "taskSummary"
  ) {

    throw new NonRetryableError(
      "Unsupported report type"
    );

  }

  logger.info("[Job Handler] Processing downloadable report...");

  return processExportJob(

    job,

    FILE_TYPES.REPORT

  );

}

// ==========================================
// 7. JOB TYPE DISPATCHER
// ==========================================

async function executeJob(job) {

  // Validate job structure.

  if (

    !job ||

    typeof job.id !== "string" ||

    !job.id.trim() ||

    !job.type ||

    !job.payload ||

    typeof job.payload !== "object" ||

    Array.isArray(job.payload)

  ) {

    throw new NonRetryableError(
      "Invalid job"
    );

  }

  // Execute the appropriate handler.

  switch (job.type) {

    // Notification job.

    case JOB_TYPES.NOTIFICATION:

      return handleNotificationJob(

        job.payload,

        job.id

      );

    // Activity log job.

    case JOB_TYPES.ACTIVITY_LOG:

      return handleActivityLogJob(

        job.payload,

        job.id

      );

    // Milestone 10: JSON export.

    case JOB_TYPES.JSON_EXPORT:

      return handleJSONExportJob(job);

    // Milestone 10: CSV export.

    case JOB_TYPES.CSV_EXPORT:

      return handleCSVExportJob(job);

    // Report generation.

    case JOB_TYPES.REPORT_GENERATION:

      // Milestone 10:
      // Generate downloadable report files
      // when export metadata is available.

      if (
        job.payload.exportId !== undefined
      ) {

        return handleReportExportJob(job);

      }

      // Preserve existing Milestone 8 and 9
      // report generation functionality.

      if (String(job.userId) !== String(job.payload.currentUser?.id)) throw new NonRetryableError("Invalid job owner");
      return handleReportGenerationJob(job.payload);

    // Unsupported job type.

    default:

      throw new NonRetryableError(
        `Unsupported job type: ${job.type}`
      );

  }

}

// ==========================================
// 8. EXPORT FUNCTIONS
// ==========================================

module.exports = {

  handleNotificationJob,

  handleActivityLogJob,

  handleReportGenerationJob,

  handleJSONExportJob,

  handleCSVExportJob,

  handleReportExportJob,

  executeJob

};
