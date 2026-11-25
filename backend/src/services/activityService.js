const Task = require("../models/taskModel");
const TaskActivity = require("../models/taskActivityModel");
const { pagination, pageInfo } = require("../utils/pagination");
const { taskVisibility } = require("../utils/taskAccess");
const { createError } = require("../utils/httpError");

const EVENT_TYPES = new Set(["taskCreated", "taskUpdated", "taskAssigned", "taskCompleted"]);

class ActivityService {
  #Activity;
  #Task;

  constructor({ activityModel = TaskActivity, taskModel = Task } = {}) {
    this.#Activity = activityModel;
    this.#Task = taskModel;
    this.getActivity = this.getActivity.bind(this);
  }

  async getActivity(currentUser, query = {}) {
    const { page, limit, skip } = pagination(query);
    const activityFilter = {};

    if (query.eventType !== undefined) {
      if (typeof query.eventType !== "string" || !EVENT_TYPES.has(query.eventType)) {
        throw createError("Invalid activity type", 400);
      }
      activityFilter.eventType = query.eventType;
    }

    const [result] = await this.#Activity.aggregate([
      { $match: activityFilter },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $lookup: {
          from: this.#Task.collection.name,
          localField: "task",
          foreignField: "_id",
          pipeline: [
            { $match: taskVisibility(currentUser) },
            { $project: { title: 1 } },
          ],
          as: "visibleTask",
        },
      },
      { $match: { "visibleTask.0": { $exists: true } } },
      {
        $facet: {
          activities: [
            { $skip: skip },
            { $limit: limit },
            {
              $addFields: {
                taskTitle: { $arrayElemAt: ["$visibleTask.title", 0] },
              },
            },
            { $project: { visibleTask: 0, backgroundJobId: 0, __v: 0 } },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const activities = result?.activities || [];
    const total = result?.total[0]?.count || 0;
    return { activities, pagination: pageInfo(page, limit, total) };
  }
}

const activityService = new ActivityService();
module.exports = activityService;
module.exports.ActivityService = ActivityService;
