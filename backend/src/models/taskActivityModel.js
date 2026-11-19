

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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "TaskActivity",
  taskActivitySchema
);
