const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    dueDate: {
      type: Date,
      default: null,
    },

    tags: {
      type: [String],
      default: [],
    },
    isOverdue: {
      type: Boolean,
      default: false,
    },

    overdueAt: {
      type: Date,
      default: null,
    },
    // Embedded durable outbox, never part of public task responses.
    pendingEvents: { type: [mongoose.Schema.Types.Mixed], default: [], select: false },
    // User who created the task
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // User to whom the task is assigned
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { transform: (_doc, result) => { delete result.pendingEvents; return result; } },
  },
);


taskSchema.index({
  status: 1,
  dueDate: 1,
});

taskSchema.index({ "pendingEvents.id": 1 }, { sparse: true });
taskSchema.index({ createdBy: 1, status: 1 });
taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ isOverdue: 1, status: 1, dueDate: 1 });
const Task = mongoose.model("Task", taskSchema);
module.exports = Task;
