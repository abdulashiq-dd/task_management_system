
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
  _id: -1,
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

// Retention is opt-in; avoid deleting historical reminders without an agreed policy.
const retentionDays = Number(process.env.NOTIFICATION_RETENTION_DAYS || 0);
if (Number.isSafeInteger(retentionDays) && retentionDays > 0 && retentionDays <= 36500) {
  notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionDays * 86400 });
}
module.exports = mongoose.model(
  "Notification",
  notificationSchema
);
