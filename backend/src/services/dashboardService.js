const Task = require("../models/taskModel");
const TaskActivity = require("../models/taskActivityModel");
const { taskVisibility } = require("../utils/taskAccess");

async function getDashboardStats(currentUser) {
  const filter = taskVisibility(currentUser);
  const now = new Date();
  const [counts, recentActivity] = await Promise.all([
    Task.aggregate([
      { $match: filter },
      { $group: {
        _id: null,
        totalTasks: { $sum: 1 },
        completedTasks: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        pendingTasks: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        overdueTasks: { $sum: { $cond: [{ $and: [{ $in: ["$status", ["pending", "in_progress"]] }, { $ne: [{ $ifNull: ["$dueDate", null] }, null] }, { $lte: ["$dueDate", now] }] }, 1, 0] } },
        low: { $sum: { $cond: [{ $eq: ["$priority", "low"] }, 1, 0] } },
        medium: { $sum: { $cond: [{ $eq: ["$priority", "medium"] }, 1, 0] } },
        high: { $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] } },
      } },
    ]),
    TaskActivity.aggregate([
      { $sort: { createdAt: -1, _id: -1 } },
      // Preserve exclusion of activities for deleted tasks for admins too.
      { $lookup: { from: Task.collection.name, localField: "task", foreignField: "_id", pipeline: [{ $match: filter }, { $project: { _id: 1 } }], as: "visibleTask" } },
      { $match: { "visibleTask.0": { $exists: true } } },
      { $limit: 10 },
      { $project: { visibleTask: 0, backgroundJobId: 0, __v: 0 } },
    ]),
  ]);
  const { totalTasks = 0, completedTasks = 0, pendingTasks = 0, overdueTasks = 0, low = 0, medium = 0, high = 0 } = counts[0] || {};
  return { totalTasks, completedTasks, pendingTasks, overdueTasks, tasksByPriority: { low, medium, high }, recentActivity };
}
module.exports = { getDashboardStats };
