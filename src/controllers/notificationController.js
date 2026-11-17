import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../Services/notificationService.js";

/**
 * GET /api/notifications
 * Retrieves paginated notifications for the authenticated user + unreadCount
 */
export const getNotificationsHandler = async (req, res, next) => {
  try {
    const { page, limit, unreadOnly } = req.query;
    const result = await getUserNotifications(req.user._id, { page, limit, unreadOnly });
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Mark single notification as read
 */
export const markNotificationReadHandler = async (req, res, next) => {
  try {
    const notification = await markNotificationAsRead(req.user._id, req.params.id);
    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      notification,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read
 */
export const markAllNotificationsReadHandler = async (req, res, next) => {
  try {
    const result = await markAllNotificationsAsRead(req.user._id);
    return res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
