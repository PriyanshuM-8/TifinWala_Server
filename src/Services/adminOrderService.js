import mongoose from "mongoose";
import Order from "../Models/Order.js";
import Payment from "../Models/Payment.js";
import Refund from "../Models/Refund.js";
import { cancelOrderByCustomer } from "./orderService.js";
import { logAdminAction } from "./auditLogService.js";

/**
 * ADMIN: Lists all platform orders with advanced multi-field filtering, search, and pagination.
 */
export async function listAllOrders({
  orderStatus,
  paymentStatus,
  paymentMethod,
  deliveryType,
  chefId,
  customerId,
  search,
  startDate,
  endDate,
  page = 1,
  limit = 20,
}) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = {};

  if (orderStatus) query.orderStatus = orderStatus;
  if (paymentStatus) query.paymentStatus = paymentStatus;
  if (paymentMethod) query.paymentMethod = paymentMethod;
  if (deliveryType) query.deliveryType = deliveryType;

  if (chefId && mongoose.Types.ObjectId.isValid(chefId)) {
    query.chefId = chefId;
  }

  if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
    query.customerId = customerId;
  }

  if (search && typeof search === "string" && search.trim().length > 0) {
    query.orderNumber = { $regex: search.trim(), $options: "i" };
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const [totalRecords, orders] = await Promise.all([
    Order.countDocuments(query),
    Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("customerId", "name email phone")
      .populate("chefId", "name email")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    orders,
  };
}

/**
 * ADMIN: Get full order snapshot including items, addresses, payment, and refund records.
 */
export async function getOrderDetails(orderId) {
  const order = await Order.findById(orderId)
    .populate("customerId", "name email phone")
    .populate("chefId", "name email")
    .lean();

  if (!order) {
    const error = new Error("Order not found.");
    error.statusCode = 404;
    throw error;
  }

  const [payment, refunds] = await Promise.all([
    order.paymentId ? Payment.findById(order.paymentId).lean() : null,
    Refund.find({ orderId: order._id }).lean(),
  ]);

  return {
    order,
    payment,
    refunds,
  };
}

/**
 * ADMIN: Aggregated order distribution across statuses, payment methods, and delivery types.
 */
export async function getOrderStatistics({ startDate, endDate } = {}) {
  const matchStage = {};
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      matchStage.createdAt.$lte = end;
    }
  }

  const [statusStats, paymentStats, deliveryStats] = await Promise.all([
    Order.aggregate([
      { $match: matchStage },
      { $group: { _id: "$orderStatus", count: { $sum: 1 }, totalAmountPaise: { $sum: "$totalAmountPaise" } } },
    ]),
    Order.aggregate([
      { $match: matchStage },
      { $group: { _id: "$paymentMethod", count: { $sum: 1 }, totalAmountPaise: { $sum: "$totalAmountPaise" } } },
    ]),
    Order.aggregate([
      { $match: matchStage },
      { $group: { _id: "$deliveryType", count: { $sum: 1 } } },
    ]),
  ]);

  const byStatus = {
    pending_confirmation: 0,
    accepted: 0,
    preparing: 0,
    ready_for_pickup: 0,
    out_for_delivery: 0,
    delivered: 0,
    cancelled: 0,
    rejected: 0,
    total: 0,
  };

  statusStats.forEach((s) => {
    if (s._id && byStatus[s._id] !== undefined) {
      byStatus[s._id] = s.count;
    }
    byStatus.total += s.count;
  });

  const byPaymentMethod = {
    online: 0,
    cod: 0,
    other: 0,
  };

  paymentStats.forEach((p) => {
    if (p._id === "online") byPaymentMethod.online = p.count;
    else if (p._id === "cod") byPaymentMethod.cod = p.count;
    else byPaymentMethod.other += p.count;
  });

  const byDeliveryType = {
    chef_delivery: 0,
    customer_pickup: 0,
  };

  deliveryStats.forEach((d) => {
    if (d._id === "chef_delivery") byDeliveryType.chef_delivery = d.count;
    else if (d._id === "customer_pickup") byDeliveryType.customer_pickup = d.count;
  });

  return {
    byStatus,
    byPaymentMethod,
    byDeliveryType,
  };
}

/**
 * ADMIN: Safely cancels an order via the verified domain cancellation service.
 * Guarantees: stock restoration, commission release, gateway refund if online paid, and audit logging.
 */
export async function cancelOrderByAdmin(orderId, adminUserId, { reason }) {
  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    const error = new Error("Cancellation reason must be at least 3 characters long.");
    error.statusCode = 400;
    throw error;
  }

  const order = await Order.findById(orderId);
  if (!order) {
    const error = new Error("Order not found.");
    error.statusCode = 404;
    throw error;
  }

  const previousState = {
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    stockRestored: order.stockRestored,
  };

  // Call domain cancellation service (handles stock, refunds, and COD releases)
  const cancellationResult = await cancelOrderByCustomer(order.customerId, order._id, reason.trim());

  const updatedOrder = await Order.findById(orderId);
  updatedOrder.cancelledBy = adminUserId;
  await updatedOrder.save();

  const newState = {
    orderStatus: updatedOrder.orderStatus,
    paymentStatus: updatedOrder.paymentStatus,
    stockRestored: updatedOrder.stockRestored,
  };

  // Record audit log
  await logAdminAction({
    adminId: adminUserId,
    actionType: "order_cancellation",
    targetEntityType: "Order",
    targetEntityId: order._id,
    previousState,
    newState,
    reason: `Order #${order.orderNumber} cancelled by admin. Reason: ${reason.trim()}`,
  });

  return {
    order: updatedOrder,
    cancellationResult,
    message: `Order #${order.orderNumber} successfully cancelled by admin. Stock restored and refunds initiated if applicable.`,
  };
}
