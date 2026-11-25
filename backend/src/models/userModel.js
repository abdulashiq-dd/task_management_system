
const mongoose = require("mongoose");

const passkeySchema = new mongoose.Schema({
  credentialId: { type: String, required: true },
  publicKey: { type: Buffer, required: true },
  counter: { type: Number, required: true, default: 0 },
  transports: { type: [String], default: [] },
  deviceType: { type: String, required: true },
  backedUp: { type: Boolean, required: true, default: false }
}, { _id: false });

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      select: false
    },

    passkeys: {
      type: [passkeySchema],
      default: [],
      select: false
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    }
  },
  { timestamps: true }
);

userSchema.index({ "passkeys.credentialId": 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("User", userSchema);
