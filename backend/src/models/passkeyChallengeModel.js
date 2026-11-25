const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  _id: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, default: null },
  purpose: { type: String, enum: ["registration", "authentication"], required: true },
  expiresAt: { type: Date, required: true }
}, { versionKey: false });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PasskeyChallenge", schema);
