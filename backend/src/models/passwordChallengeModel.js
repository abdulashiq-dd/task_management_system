const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  _id: { type: String },
  operation: { type: String, enum: ["login", "register"], required: true },
  account: { type: String, required: true },
  keyId: { type: String, required: true },
  challenge: { type: String, required: true },
  expiresAt: { type: Date, required: true }
}, { versionKey: false });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PasswordChallenge", schema);
