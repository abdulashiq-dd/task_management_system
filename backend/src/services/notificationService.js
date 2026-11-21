
const mongoose = require("mongoose");
const Notification = require("../models/notificationModel");

// ==========================================
// HELPER — ERROR HANDLING
// ==========================================

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// ==========================================
// 1. CREATE NOTIFICATION
// ==========================================

const createNotification = async ({
  user,
  task,
  type,
  message,
}) => {
  if (!user || !task || !type || !message) {
    throw createError(
      "Notification details are required",
      400
    );
  }

  if (
    !mongoose.isValidObjectId(user) ||
    !mongoose.isValidObjectId(task)
  ) {
    throw createError(
      "Invalid user or task ID",
      400
    );
  }

  const notification = await Notification.create({
    user,
    task,
    type,
    message,
    isRead: false,
  });

  return notification;
};

// ==========================================
// 2. GET USER NOTIFICATIONS
// ==========================================

const getUserNotifications = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) {
    throw createError("Invalid user ID", 400);
  }

  return Notification.find({
    user: userId,
  }).sort({
    createdAt: -1,
  });
};

// ==========================================
// 3. MARK ONE NOTIFICATION AS READ
// ==========================================

const markNotificationAsRead = async (
  notificationId,
  userId
) => {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw createError(
      "Invalid notification ID",
      400
    );
  }

  const notification =
    await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        user: userId,
      },
      {
        $set: { isRead: true },
      },
      {
        returnDocument: "after",
        runValidators: true,
      }
    );

  if (!notification) {
    throw createError(
      "Notification not found",
      404
    );
  }

  return notification;
};

// ==========================================
// 4. MARK ALL NOTIFICATIONS AS READ
// ==========================================

const markAllNotificationsAsRead = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) {
    throw createError("Invalid user ID", 400);
  }

  const result = await Notification.updateMany(
    {
      user: userId,
      isRead: false,
    },
    {
      $set: { isRead: true },
    }
  );

  return {
    modifiedCount: result.modifiedCount,
  };
};

// ==========================================
// EXPORT SERVICES
// ==========================================

module.exports = {
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};
