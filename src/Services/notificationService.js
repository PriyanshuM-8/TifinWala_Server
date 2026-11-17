import InAppNotification from "../Models/InAppNotification.js";
import ChefProfile from "../Models/ChefProfile.js";
import { notifyUser, notifyOrder } from "../Config/socket.js";

/**
 * Direct Chef Order Notification
 *
 * CRITICAL BUSINESS RULE:
 * - Order notification is sent EXCLUSIVELY to that food's actual owner (order.chefId).
 * - Never broadcasts order to nearby chefs.
 * - Payment-aware:
 *   * For COD: Notifies chef immediately after successful order placement.
 *   * For Online payment: Notifies chef ONLY after successful verified payment.
 *   * Never notifies for failed or abandoned payments.
 */
export const sendDirectChefOrderNotification = async (order) => {
  if (!order || !order.chefId) return null;

  // Payment-aware check:
  // If payment method is online and status is not paid, do not notify chef yet.
  if (order.paymentMethod === "online" && order.paymentStatus !== "paid") {
    return null;
  }

  const payload = {
    orderId: order._id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    totalAmount: order.totalAmount,
    subtotal: order.subtotal,
    deliveryType: order.deliveryType,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    items: order.items || [],
    deliveryAddressSnapshot: order.deliveryAddressSnapshot || null,
    pickupInformation: order.pickupInformation || null,
    createdAt: order.createdAt,
  };

  try {
    // 1. In-DB Persistent Notification for Chef
    const notification = await InAppNotification.create({
      recipientId: order.chefId,
      recipientRole: "chef",
      title: "New Customer Order Received!",
      message: `Order #${order.orderNumber} for ₹${order.totalAmount} has been placed. Please accept and start preparation.`,
      type: "order_placed",
      metadata: payload,
    });

    // 2. Real-time Socket.IO emission to the designated chef only
    notifyUser(order.chefId, "new_order", {
      ...payload,
      notificationId: notification._id,
    });

    // Also notify by ChefProfile _id or userId to guarantee delivery
    try {
      const chefProf = await ChefProfile.findOne({
        $or: [{ userId: order.chefId }, { _id: order.chefId }],
      });
      if (chefProf) {
        if (chefProf._id && chefProf._id.toString() !== order.chefId.toString()) {
          notifyUser(chefProf._id, "new_order", {
            ...payload,
            notificationId: notification._id,
          });
        }
        if (chefProf.userId && chefProf.userId.toString() !== order.chefId.toString()) {
          notifyUser(chefProf.userId, "new_order", {
            ...payload,
            notificationId: notification._id,
          });
        }
      }
    } catch (profErr) {
      // Non-blocking lookup
    }

    // 3. Emit to order room
    notifyOrder(order._id, "order_placed", payload);

    return notification;
  } catch (err) {
    console.error("Failed to dispatch chef order notification:", err.message);
    return null;
  }
};

/**
 * Customer Order Status Synchronization
 *
 * Dispatches real-time Socket.IO event AND persists InAppNotification for customer.
 */
export const sendOrderStatusNotification = async (order, newStatus, extraData = {}) => {
  if (!order || !order.customerId) return null;

  let title = "Order Status Update";
  let message = `Your order #${order.orderNumber} status changed to ${newStatus}.`;

  switch (newStatus) {
    case "accepted":
      title = "Order Accepted by Kitchen!";
      message = `Your order #${order.orderNumber} has been accepted by ${order.pickupInformation?.kitchenName || "the chef"}. Preparation will begin soon.`;
      break;
    case "preparing":
      title = "Food Preparation Started!";
      message = `The chef is cooking your freshly prepared meal for order #${order.orderNumber}.`;
      break;
    case "ready_for_pickup":
      title = "Food Ready for Pickup!";
      message = `Your freshly cooked order #${order.orderNumber} is ready for pickup at ${order.pickupInformation?.kitchenName || "the kitchen"}.`;
      break;
    case "out_for_delivery":
      title = "Order Out for Delivery!";
      message = `Your order #${order.orderNumber} is on its way to your delivery address.`;
      break;
    case "delivered":
      title = "Order Delivered! Enjoy Your Food";
      message = `Order #${order.orderNumber} has been delivered successfully. Rate your homemade food experience!`;
      break;
    case "rejected":
      title = "Order Declined by Kitchen";
      message = extraData.rejectionReason
        ? `Order #${order.orderNumber} could not be accepted: "${extraData.rejectionReason}". Any paid amount has been refunded.`
        : `Order #${order.orderNumber} could not be accepted by the kitchen. Any paid amount has been refunded.`;
      break;
    case "cancelled":
      title = "Order Cancelled";
      message = `Order #${order.orderNumber} has been cancelled.`;
      break;
    default:
      break;
  }

  const payload = {
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: newStatus,
    ...extraData,
  };

  try {
    // 1. In-DB Persistent Notification for Customer
    const notification = await InAppNotification.create({
      recipientId: order.customerId,
      recipientRole: "customer",
      title,
      message,
      type: `order_${newStatus}`,
      metadata: payload,
    });

    // 2. Real-time Socket.IO emission to the customer's personal user room
    notifyUser(order.customerId, "order_status_updated", {
      ...payload,
      title,
      message,
      notificationId: notification._id,
    });

    // Notify chef's room as well
    if (order.chefId) {
      notifyUser(order.chefId, "order_status_updated", {
        ...payload,
        title,
        message,
        notificationId: notification._id,
      });
    }

    // 3. Real-time Socket.IO emission to the order room
    notifyOrder(order._id, "order_status_updated", {
      ...payload,
      title,
      message,
    });

    return notification;
  } catch (err) {
    console.error("Failed to dispatch order status notification:", err.message);
    return null;
  }
};

/**
 * Get in-app notifications for authenticated user
 */
export const getUserNotifications = async (userId, { page = 1, limit = 20, unreadOnly = false } = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = { recipientId: userId };
  if (unreadOnly === true || unreadOnly === "true") {
    filter.isRead = false;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    InAppNotification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    InAppNotification.countDocuments(filter),
    InAppNotification.countDocuments({ recipientId: userId, isRead: false }),
  ]);

  return {
    notifications,
    unreadCount,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum) || (total === 0 ? 0 : 1),
      totalItems: total,
      limit: limitNum,
    },
  };
};

/**
 * Mark a single notification as read
 */
export const markNotificationAsRead = async (userId, notificationId) => {
  const notification = await InAppNotification.findOneAndUpdate(
    { _id: notificationId, recipientId: userId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );
  if (!notification) {
    const error = new Error("Notification not found.");
    error.statusCode = 404;
    throw error;
  }
  return notification;
};

/**
 * Mark all notifications as read for user
 */
export const markAllNotificationsAsRead = async (userId) => {
  const result = await InAppNotification.updateMany(
    { recipientId: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return { modifiedCount: result.modifiedCount };
};
