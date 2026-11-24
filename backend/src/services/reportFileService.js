
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");

const dashboardService = require("./dashboardService");

const {
  FILE_TYPES,
  initializeFileStorage,
  generateFileName,
  getFilePath,
  getFileMetadata
} = require("../config/fileStorage");

const {
  buildExportFilter
} = require("../utils/exportFilters");

// ==========================================
// 1. CALCULATE COMPLETION RATE
// ==========================================

function calculateCompletionRate(
  completedTasks,
  totalTasks
) {

  if (totalTasks === 0) {
    return 0;
  }

  return Number(
    ((completedTasks / totalTasks) * 100)
      .toFixed(2)
  );

}

// ==========================================
// 2. GENERATE TASK SUMMARY
// ==========================================

async function generateTaskSummary(currentUser) {

  // Validate authenticated user and role.
  buildExportFilter(currentUser);

  // Reuse existing dashboard functionality.
  const dashboard =
    await dashboardService.getDashboardStats(
      currentUser
    );

  return {

    reportType: "taskSummary",

    generatedAt: new Date().toISOString(),

    generatedBy: String(currentUser.id),

    scope: currentUser.role === "admin"
      ? "all_tasks"
      : "authorized_tasks",

    totalTasks: dashboard.totalTasks,

    completedTasks: dashboard.completedTasks,

    pendingTasks: dashboard.pendingTasks,

    overdueTasks: dashboard.overdueTasks,

    completionRate: calculateCompletionRate(
      dashboard.completedTasks,
      dashboard.totalTasks
    ),

    tasksByPriority: dashboard.tasksByPriority

  };

}

// ==========================================
// 3. GENERATE REPORT FILE
// ==========================================

async function generateTaskSummaryReport(
  currentUser,
  requestedFileName
) {

  buildExportFilter(currentUser);

  await initializeFileStorage();

  const fileName =
    requestedFileName ||
    generateFileName(FILE_TYPES.REPORT);

  const filePath = getFilePath(
    FILE_TYPES.REPORT,
    fileName
  );

  const temporaryPath =
    `${filePath}.${randomUUID()}.tmp`;

  try {

    // Generate task statistics.

    const report = await generateTaskSummary(
      currentUser
    );

    // Convert report to formatted JSON.

    const content = JSON.stringify(
      report,
      null,
      2
    );

    // Write temporary report file.

    await fs.writeFile(
      temporaryPath,
      content,
      {
        encoding: "utf8",
        flag: "wx"
      }
    );

    // Publish completed report.

    await fs.rename(
      temporaryPath,
      filePath
    );

    // Retrieve actual file metadata.

    const metadata = await getFileMetadata(
      FILE_TYPES.REPORT,
      fileName
    );

    console.log(
      "[Report Service] Task summary report generated"
    );

    console.log(
      "[Report Service] Total tasks:",
      report.totalTasks
    );

    return {

      type: FILE_TYPES.REPORT,

      fileName,

      mimeType: "application/json",

      size: metadata.size,

      totalRecords: report.totalTasks,

      report

    };

  } finally {

    // Remove temporary output if generation fails.

    await fs.rm(
      temporaryPath,
      {
        force: true
      }
    );

  }

}

// ==========================================
// 4. EXPORT FUNCTIONS
// ==========================================

module.exports = {
  calculateCompletionRate,
  generateTaskSummary,
  generateTaskSummaryReport
};
