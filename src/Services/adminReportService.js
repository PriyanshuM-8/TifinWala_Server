import Order from "../Models/Order.js";
import Subscription from "../Models/Subscription.js";
import SubscriptionMealOrder from "../Models/SubscriptionMealOrder.js";
import Food from "../Models/Food.js";
import User from "../Models/User.js";
import Payment from "../Models/Payment.js";
import Review from "../Models/Review.js";
import { getFinanceOverview } from "./adminFinanceService.js";

/**
 * Builds standard date filter query.
 */
function buildDateFilter(startDate, endDate) {
  if (!startDate && !endDate) return null;
  const filter = {};
  if (startDate) filter.$gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filter.$lte = end;
  }
  return filter;
}

/**
 * 1. Orders Report
 */
export async function getOrderReport({ startDate, endDate, groupBy = "day" } = {}) {
  const dateFilter = buildDateFilter(startDate, endDate);
  const matchStage = dateFilter ? { createdAt: dateFilter } : {};

  let dateFormat = "%Y-%m-%d";
  if (groupBy === "month") dateFormat = "%Y-%m";
  else if (groupBy === "week") dateFormat = "%Y-W%V";

  const [timelineAgg, methodAgg, deliveryAgg] = await Promise.all([
    Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: "$createdAt" } },
          totalOrders: { $sum: 1 },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] },
          },
          rejectedOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "rejected"] }, 1, 0] },
          },
          totalAmountPaise: { $sum: "$totalAmountPaise" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          totalAmountPaise: { $sum: "$totalAmountPaise" },
        },
      },
    ]),
    Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$deliveryType",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  return {
    groupBy,
    timeline: timelineAgg,
    byPaymentMethod: methodAgg,
    byDeliveryType: deliveryAgg,
  };
}

/**
 * 2. Revenue Report
 */
export async function getRevenueReport({ startDate, endDate } = {}) {
  const finance = await getFinanceOverview({ startDate, endDate });
  return {
    period: { startDate, endDate },
    revenue: finance.platformRevenue,
    collections: finance.collections,
    refunds: finance.refunds,
    chefEarnings: finance.chefEarnings,
  };
}

/**
 * 3. Chef Performance Report
 */
export async function getChefReport({ startDate, endDate, limit = 20 } = {}) {
  const dateFilter = buildDateFilter(startDate, endDate);
  const matchStage = dateFilter ? { createdAt: dateFilter } : {};

  const chefsAgg = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$chefId",
        totalOrders: { $sum: 1 },
        deliveredOrders: {
          $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] },
        },
        cancelledOrders: {
          $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] },
        },
        rejectedOrders: {
          $sum: { $cond: [{ $eq: ["$orderStatus", "rejected"] }, 1, 0] },
        },
        grossOrderValuePaise: { $sum: "$totalAmountPaise" },
      },
    },
    { $sort: { deliveredOrders: -1, totalOrders: -1 } },
    { $limit: Number(limit) || 20 },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "chefUser",
      },
    },
    { $unwind: { path: "$chefUser", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "chefprofiles",
        localField: "_id",
        foreignField: "userId",
        as: "profile",
      },
    },
    { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        chefId: "$_id",
        chefName: "$chefUser.name",
        kitchenName: "$profile.kitchenName",
        ownerName: "$profile.ownerName",
        city: "$profile.city",
        totalOrders: 1,
        deliveredOrders: 1,
        cancelledOrders: 1,
        rejectedOrders: 1,
        deliverySuccessRatePercent: {
          $cond: [
            { $gt: ["$totalOrders", 0] },
            { $round: [{ $multiply: [{ $divide: ["$deliveredOrders", "$totalOrders"] }, 100] }, 2] },
            0,
          ],
        },
        grossOrderValuePaise: 1,
      },
    },
  ]);

  return {
    topChefs: chefsAgg,
  };
}

/**
 * 4. Customer Activity Report
 */
export async function getCustomerReport({ startDate, endDate, limit = 20 } = {}) {
  const dateFilter = buildDateFilter(startDate, endDate);
  const matchStage = dateFilter ? { createdAt: dateFilter } : {};

  const [topCustomersAgg, frequencyAgg] = await Promise.all([
    Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$customerId",
          orderCount: { $sum: 1 },
          deliveredCount: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] },
          },
          totalSpentPaise: { $sum: "$totalAmountPaise" },
        },
      },
      { $sort: { orderCount: -1, totalSpentPaise: -1 } },
      { $limit: Number(limit) || 20 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "customerUser",
        },
      },
      { $unwind: { path: "$customerUser", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          customerId: "$_id",
          name: "$customerUser.name",
          email: "$customerUser.email",
          phone: "$customerUser.phone",
          orderCount: 1,
          deliveredCount: 1,
          totalSpentPaise: 1,
          totalSpent: { $round: [{ $divide: ["$totalSpentPaise", 100] }, 2] },
        },
      },
    ]),
    Order.aggregate([
      { $match: matchStage },
      { $group: { _id: "$customerId", orderCount: { $sum: 1 } } },
      {
        $group: {
          _id: null,
          totalCustomersPlacingOrders: { $sum: 1 },
          repeatCustomers: {
            $sum: { $cond: [{ $gt: ["$orderCount", 1] }, 1, 0] },
          },
          singleOrderCustomers: {
            $sum: { $cond: [{ $eq: ["$orderCount", 1] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  return {
    topCustomers: topCustomersAgg,
    retentionSummary: frequencyAgg[0] || {
      totalCustomersPlacingOrders: 0,
      repeatCustomers: 0,
      singleOrderCustomers: 0,
    },
  };
}

/**
 * 5. Food Popularity Report
 */
export async function getFoodReport({ limit = 20 } = {}) {
  const [topFoodsAgg, categoryPopularityAgg] = await Promise.all([
    Order.aggregate([
      { $match: { orderStatus: "delivered" } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.foodId",
          foodName: { $first: "$items.foodName" },
          foodType: { $first: "$items.foodType" },
          totalQuantityOrdered: { $sum: "$items.quantity" },
          totalRevenuePaise: { $sum: "$items.itemTotal" },
        },
      },
      { $sort: { totalQuantityOrdered: -1 } },
      { $limit: Number(limit) || 20 },
    ]),
    Food.aggregate([
      {
        $group: {
          _id: "$categoryId",
          foodCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "categoryDoc",
        },
      },
      { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          categoryId: "$_id",
          categoryName: "$categoryDoc.name",
          foodCount: 1,
        },
      },
    ]),
  ]);

  return {
    topSellingFoods: topFoodsAgg,
    categoryDistribution: categoryPopularityAgg,
  };
}

/**
 * 6. Subscription Analytics Report
 */
export async function getSubscriptionReport() {
  const [statusAgg, mealStatusAgg] = await Promise.all([
    Subscription.aggregate([
      {
        $group: {
          _id: "$subscriptionStatus",
          count: { $sum: 1 },
          totalAmountPaise: { $sum: "$totalAmountPaise" },
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

  const mealSummary = {
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
    total: 0,
  };

  mealStatusAgg.forEach((m) => {
    if (m._id && mealSummary[m._id] !== undefined) {
      mealSummary[m._id] = m.count;
    }
    mealSummary.total += m.count;
  });

  return {
    subscriptionStatuses: statusAgg,
    mealSummary,
  };
}

/**
 * 7. Payment Analytics Report
 */
export async function getPaymentReport({ startDate, endDate } = {}) {
  const dateFilter = buildDateFilter(startDate, endDate);
  const matchStage = dateFilter ? { createdAt: dateFilter } : {};

  const [paymentStatusAgg, paymentMethodAgg] = await Promise.all([
    Payment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmountPaise: { $sum: "$payableAmountPaise" },
        },
      },
    ]),
    Payment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          totalAmountPaise: { $sum: "$payableAmountPaise" },
        },
      },
    ]),
  ]);

  return {
    byStatus: paymentStatusAgg,
    byMethod: paymentMethodAgg,
  };
}

/**
 * 8. Cancellations Report
 */
export async function getCancellationReport({ startDate, endDate } = {}) {
  const dateFilter = buildDateFilter(startDate, endDate);
  const matchStage = {
    orderStatus: "cancelled",
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };

  const cancellations = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          $cond: [{ $ifNull: ["$cancelledBy", false] }, "identified", "unknown"],
        },
        count: { $sum: 1 },
        totalAmountPaise: { $sum: "$totalAmountPaise" },
      },
    },
  ]);

  const reasonsAgg = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$cancellationReason",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  return {
    cancellationSummary: cancellations,
    commonReasons: reasonsAgg,
  };
}
