
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

    // Deadline associated with the reminder.
    reminderDueDate: {
      type: Date,
    },

    // Unique identifier for scheduled notifications.
    deduplicationKey: {
      type: String,
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

// Prevent duplicate scheduled notifications.
// Existing notifications without a key are unaffected.
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

module.exports = mongoose.model(
  "Notification",
  notificationSchema
);
