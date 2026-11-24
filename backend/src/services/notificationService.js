
const mongoose = require("mongoose");

const Notification = require("../models/notificationModel");
const { pagination, pageInfo } = require("../utils/pagination");
const PUBLIC_FIELDS = "user task type message isRead reminderDueDate createdAt updatedAt";

const {
  createIdempotent,
} = require("../utils/idempotentWrite");

// ==========================================
// HELPER - ERROR HANDLING
// ==========================================

const { createError } = require("../utils/httpError");

class NotificationService {
  #Notification;
  #createIdempotent;

  constructor({ notificationModel = Notification, idempotentWrite = createIdempotent } = {}) {
    this.#Notification = notificationModel;
    this.#createIdempotent = idempotentWrite;
    this.createNotification = this.createNotification.bind(this);
    this.getUserNotifications = this.getUserNotifications.bind(this);
    this.markNotificationAsRead = this.markNotificationAsRead.bind(this);
    this.markAllNotificationsAsRead = this.markAllNotificationsAsRead.bind(this);
  }

  // ==========================================
  // 1. CREATE NOTIFICATION
  // ==========================================

  async createNotification({
    user,
    task,
    type,
    message,
    backgroundJobId,
  }) {

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

    const notificationData = {
      user,
      task,
      type,
      message,
      isRead: false,
    };

    // Milestone 9: Idempotent background writes.

    if (backgroundJobId !== undefined) {

      return this.#createIdempotent(
        this.#Notification,
        backgroundJobId,
        notificationData
      );
    }

    // Preserve existing notification creation.

    return this.#Notification.create(notificationData);
  }

  // ==========================================
  // 2. GET USER NOTIFICATIONS
  // ==========================================

  async getUserNotifications(userId, query = {}) {

    if (!mongoose.isValidObjectId(userId)) {
      throw createError("Invalid user ID", 400);
    }

    const { page, limit, skip } = pagination(query);
    const filter = { user: userId };
    const [notifications, total] = await Promise.all([
      this.#Notification.find(filter).select(PUBLIC_FIELDS).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      this.#Notification.countDocuments(filter),
    ]);
    return { notifications, pagination: pageInfo(page, limit, total) };
  }

  // ==========================================
  // 3. MARK ONE NOTIFICATION AS READ
  // ==========================================

  async markNotificationAsRead(
    notificationId,
    userId
  ) {

    if (!mongoose.isValidObjectId(notificationId) || !mongoose.isValidObjectId(userId)) {
      throw createError(
        "Invalid notification ID",
        400
      );
    }

    const notification =
      await this.#Notification.findOneAndUpdate(
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
  }

  // ==========================================
  // 4. MARK ALL NOTIFICATIONS AS READ
  // ==========================================

  async markAllNotificationsAsRead(userId) {

    if (!mongoose.isValidObjectId(userId)) {
      throw createError("Invalid user ID", 400);
    }

    const result = await this.#Notification.updateMany(
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
  }
}

module.exports = new NotificationService();
module.exports.NotificationService = NotificationService;
