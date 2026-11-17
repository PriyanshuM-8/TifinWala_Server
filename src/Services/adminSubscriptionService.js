import mongoose from "mongoose";
import Subscription from "../Models/Subscription.js";
import SubscriptionMealOrder from "../Models/SubscriptionMealOrder.js";

/**
 * Admin: List all platform subscriptions with filtering and pagination
 */
export const getAllSubscriptions = async (query = {}) => {
  const page = parseInt(query.page, 10) || 1;
  const limit = Math.min(parseInt(query.limit, 10) || 10, 50);
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.status) filter.subscriptionStatus = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.customerId) filter.customerId = query.customerId;
  if (query.startDateKey) filter.startDateKey = { $gte: query.startDateKey };
  if (query.endDateKey) filter.endDateKey = { $lte: query.endDateKey };

  const [totalRecords, subscriptions] = await Promise.all([
    Subscription.countDocuments(filter),
    Subscription.find(filter)
      .populate("customerId", "name email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    success: true,
    pagination: {
      totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit) || 1,
    },
    subscriptions,
  };
};

/**
 * Admin: Detailed inspection of a specific subscription and its child meal orders
 */
export const getSubscriptionDetails = async (subscriptionId) => {
  const subscription = await Subscription.findById(subscriptionId)
    .populate("customerId", "name email phone")
    .lean();

  if (!subscription) {
    const error = new Error("Subscription not found.");
    error.statusCode = 404;
    throw error;
  }

  const mealOrders = await SubscriptionMealOrder.find({ subscriptionId })
    .populate("chefId", "name email")
    .sort({ scheduledDateKey: 1, mealType: 1 })
    .lean();

  // Aggregate stats
  const statusCounts = {};
  mealOrders.forEach((m) => {
    statusCounts[m.orderStatus] = (statusCounts[m.orderStatus] || 0) + 1;
  });

  return {
    subscription,
    summary: {
      totalMeals: mealOrders.length,
      statusCounts,
    },
    mealOrders,
  };
};

/**
 * Admin: Platform-wide subscription metrics & analytics
 */
export const getSubscriptionStatistics = async () => {
  const [subStats, mealStats] = await Promise.all([
    Subscription.aggregate([
      {
        $group: {
          _id: "$subscriptionStatus",
          count: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
        },
      },
    ]),
    SubscriptionMealOrder.aggregate([
      {
        $group: {
          _id: "$orderStatus",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const subscriptionsByStatus = {
    pending_payment: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
    totalSubscriptions: 0,
    totalGrossValue: 0,
  };

  subStats.forEach((s) => {
    if (subscriptionsByStatus[s._id] !== undefined) {
      subscriptionsByStatus[s._id] = s.count;
    }
    subscriptionsByStatus.totalSubscriptions += s.count;
    subscriptionsByStatus.totalGrossValue += s.totalRevenue || 0;
  });

  const mealsByStatus = {
    scheduled: 0,
    accepted: 0,
    preparing: 0,
    ready_for_pickup: 0,
    out_for_delivery: 0,
    delivered: 0,
    skipped: 0,
    cancelled: 0,
    rejected: 0,
    expired: 0,
    totalMeals: 0,
  };

  mealStats.forEach((m) => {
    if (mealsByStatus[m._id] !== undefined) {
      mealsByStatus[m._id] = m.count;
    }
    mealsByStatus.totalMeals += m.count;
  });

  return {
    subscriptions: subscriptionsByStatus,
    meals: mealsByStatus,
  };
};

/**
 * Admin: Paginated inspection of child meal orders for a subscription
 */
export const getSubscriptionMeals = async (
  subscriptionId,
  { page = 1, limit = 20, orderStatus, mealType, scheduledDateKey } = {}
) => {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = { subscriptionId };
  if (orderStatus) query.orderStatus = orderStatus;
  if (mealType) query.mealType = mealType;
  if (scheduledDateKey) query.scheduledDateKey = scheduledDateKey;

  const [totalRecords, meals] = await Promise.all([
    SubscriptionMealOrder.countDocuments(query),
    SubscriptionMealOrder.find(query)
      .sort({ scheduledDateKey: 1, mealType: 1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("chefId", "name email")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    meals,
  };
};
