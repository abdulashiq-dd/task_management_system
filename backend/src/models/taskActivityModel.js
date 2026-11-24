
const mongoose = require("mongoose");

const taskActivitySchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },

    eventType: {
      type: String,
      enum: [
        "taskCreated",
        "taskUpdated",
        "taskAssigned",
        "taskCompleted",
      ],
      required: true,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Milestone 9: Prevent duplicate activity logs.
    backgroundJobId: {
      type: String,
      trim: true,
      immutable: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate activity logs when a job is retried.
taskActivitySchema.index(
  {
    backgroundJobId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      backgroundJobId: { $type: "string" },
    },
  }
);

taskActivitySchema.index({ task: 1, createdAt: -1 });
taskActivitySchema.index({ createdAt: -1, _id: -1 });
module.exports = mongoose.model(
  "TaskActivity",
  taskActivitySchema
);
