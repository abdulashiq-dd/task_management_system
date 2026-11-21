const mongoose = require("mongoose");
const Task = require("../models/taskModel");
const TaskActivity = require("../models/taskActivityModel");

// ==========================================
// HELPER — ERROR HANDLING
// ==========================================

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// ==========================================
// HELPER — USER TASK VISIBILITY
// ==========================================

const getTaskFilter = (currentUser) => {
  if (!currentUser?.id) {
    throw createError("Authentication required", 401);
  }

  if (currentUser.role === "admin") {
    return {};
  }

  if (!mongoose.isValidObjectId(currentUser.id)) {
    throw createError("Invalid user ID", 400);
  }

  const userId = new mongoose.Types.ObjectId(
    currentUser.id
  );

  return {
    $or: [
      { createdBy: userId },
      { assignedTo: userId },
    ],
  };
};

// ==========================================
// 1. TOTAL TASKS
// ==========================================

const getTotalTasks = async (filter) => {
  return Task.countDocuments(filter);
};

// ==========================================
// 2. COMPLETED TASKS
// ==========================================

const getCompletedTasks = async (filter) => {
  return Task.countDocuments({
    $and: [
      filter,
      { status: "completed" },
    ],
  });
};

// ==========================================
// 3. PENDING TASKS
// ==========================================

const getPendingTasks = async (filter) => {
  return Task.countDocuments({
    $and: [
      filter,
      { status: "pending" },
    ],
  });
};

// ==========================================
// 4. OVERDUE TASKS
// ==========================================

const getOverdueTasks = async (filter) => {
  // Beginning of today in UTC.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Task.countDocuments({
    $and: [
      filter,
      {
        dueDate: {
          $lt: today,
          $ne: null,
        },
        status: {
          $ne: "completed",
        },
      },
    ],
  });
};

// ==========================================
// 5. TASKS BY PRIORITY
// ==========================================

const getTasksByPriority = async (filter) => {
  const result = await Task.aggregate([
    {
      $match: filter,
    },
    {
      $group: {
        _id: "$priority",
        count: { $sum: 1 },
      },
    },
  ]);

  const priorityCounts = {
    low: 0,
    medium: 0,
    high: 0,
  };

  result.forEach((item) => {
    if (
      Object.prototype.hasOwnProperty.call(
        priorityCounts,
        item._id
      )
    ) {
      priorityCounts[item._id] = item.count;
    }
  });

  return priorityCounts;
};

// ==========================================
// 6. RECENT ACTIVITY
// ==========================================

const getRecentActivity = async (filter) => {
  // Find tasks visible to the current user.
  const taskIds = await Task.distinct(
    "_id",
    filter
  );

  // Only return activities for those tasks.
  return TaskActivity.find({
    task: { $in: taskIds },
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(10)
    .lean();
};

// ==========================================
// 7. GET DASHBOARD STATISTICS
// ==========================================

const getDashboardStats = async (currentUser) => {
  const filter = getTaskFilter(currentUser);

  // Start independent operations concurrently.
  const [
    totalTasks,
    completedTasks,
    pendingTasks,
    overdueTasks,
    tasksByPriority,
    recentActivity,
  ] = await Promise.all([
    getTotalTasks(filter),
    getCompletedTasks(filter),
    getPendingTasks(filter),
    getOverdueTasks(filter),
    getTasksByPriority(filter),
    getRecentActivity(filter),
  ]);

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    overdueTasks,
    tasksByPriority,
    recentActivity,
  };
};

// ==========================================
// EXPORT SERVICES
// ==========================================

module.exports = {
  getDashboardStats,
};
