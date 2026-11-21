
const notificationService = require("../services/notificationService");

// ==========================================
// 1. GET ALL NOTIFICATIONS
// ==========================================

const getNotifications = async (req, res, next) => {
  try {
    const notifications =
      await notificationService.getUserNotifications(req.user.id);

    res.status(200).json({
      message: "Notifications fetched successfully",
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. MARK ONE NOTIFICATION AS READ
// ==========================================

const markAsRead = async (req, res, next) => {
  try {
    const notification =
      await notificationService.markNotificationAsRead(
        req.params.id,
        req.user.id
      );

    res.status(200).json({
      message: "Notification marked as read",
      notification,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. MARK ALL NOTIFICATIONS AS READ
// ==========================================

const markAllAsRead = async (req, res, next) => {
  try {
    const result =
      await notificationService.markAllNotificationsAsRead(
        req.user.id
      );

    res.status(200).json({
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};
