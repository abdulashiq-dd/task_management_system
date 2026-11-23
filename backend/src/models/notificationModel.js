
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },

    type: {
      type: String,
      enum: [
        "taskAssigned",
        "taskCompleted",
        "priorityChanged",
        "taskReminder",
        "taskOverdue",
      ],
      required: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    // Milestone 7: Reminder deadline.
    reminderDueDate: {
      type: Date,
    },

    // Milestone 7: Prevent duplicate reminders.
    deduplicationKey: {
      type: String,
    },

    // Milestone 9: Prevent duplicate background writes.
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

// Retrieve user notifications efficiently.
notificationSchema.index({
  user: 1,
  createdAt: -1,
});

// Milestone 7: Prevent duplicate scheduled notifications.
notificationSchema.index(
  {
    deduplicationKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      deduplicationKey: { $type: "string" },
    },
  }
);

// Milestone 9: Prevent duplicate background notifications.
notificationSchema.index(
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

module.exports = mongoose.model(
  "Notification",
  notificationSchema
);
