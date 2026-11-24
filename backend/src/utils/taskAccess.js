const mongoose = require("mongoose");
const { createError } = require("./httpError");
function validateUser(user) {
  if (!user?.id) throw createError("Authentication required", 401);
  if (!mongoose.isObjectIdOrHexString(user.id)) throw createError("Invalid user ID", 400);
  if (!["user", "admin"].includes(user.role)) throw createError("Invalid user role", 403);
}
function taskVisibility(user) {
  validateUser(user);
  if (user.role === "admin") return {};
  const id = new mongoose.Types.ObjectId(user.id);
  return { $or: [{ createdBy: id }, { assignedTo: id }] };
}
module.exports = { validateUser, taskVisibility };
