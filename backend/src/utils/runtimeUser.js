const User = require("../models/userModel");
const mongoose = require("mongoose");
const { NonRetryableError } = require("./jobErrors");
async function runtimeUser(id) {
  if (!mongoose.isObjectIdOrHexString(id)) throw new NonRetryableError("Invalid job owner");
  const user = await User.findById(id).select("role").lean();
  if (!user || !["user", "admin"].includes(user.role)) throw new NonRetryableError("Job owner is no longer authorized");
  return { id: String(user._id), role: user.role };
}
module.exports = { runtimeUser };
