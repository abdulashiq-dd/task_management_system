const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  userId: { type: String, default: null },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ["pending", "processing", "retrying", "completed", "failed"], required: true },
  priority: { type: Number, default: 1 },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  error: String, lastError: String, errorHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  attempts: Number, maxRetries: Number, retryCount: Number, retryDelay: Number,
  nextRetryAt: Date, createdAt: Date, startedAt: Date, lastAttemptAt: Date,
  completedAt: Date, failedAt: Date, isPermanentlyFailed: Boolean, expiresAt: Date,
}, { versionKey: false });
schema.index({ status: 1, priority: 1, createdAt: 1 });
schema.index({ status: 1, nextRetryAt: 1 });
schema.index({ userId: 1, createdAt: -1, _id: -1 });
schema.index({ createdAt: -1, _id: -1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("BackgroundJob", schema);
