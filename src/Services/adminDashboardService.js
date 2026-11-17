import User from "../Models/User.js";
import ChefProfile from "../Models/ChefProfile.js";
import Order from "../Models/Order.js";
import Subscription from "../Models/Subscription.js";
import Food from "../Models/Food.js";
import Category from "../Models/Category.js";
import { getFinanceOverview } from "./adminFinanceService.js";

/**
 * Resolves date boundaries based on standard period identifiers.
 */
function resolvePeriodDates(period, customStart, customEnd) {
  const now = new Date();
  let startDate = null;
  let endDate = null;

  switch (period) {
    case "today": {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      break;
    }
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      startDate = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
      endDate = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
      break;
    }
    case "7days": {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      endDate = now;
      break;
    }
    case "30days": {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      endDate = now;
      break;
    }
    case "this_month": {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate = now;
      break;
    }
    case "last_month": {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    }
    case "custom": {
      if (customStart) startDate = new Date(customStart);
      if (customEnd) {
        endDate = new Date(customEnd);
        endDate.setHours(23, 59, 59, 999);
      }
      break;
    }
    default: {
      if (customStart || customEnd) {
        if (customStart) startDate = new Date(customStart);
        if (customEnd) {
          endDate = new Date(customEnd);
          endDate.setHours(23, 59, 59, 999);
        }
      }
      break;
    }
  }

  return { startDate, endDate };
}

/**
 * ADMIN: Centralized Dashboard Overview Aggregations.
 */
export async function getDashboardOverview({ period, startDate: qStart, endDate: qEnd } = {}) {
  const { startDate, endDate } = resolvePeriodDates(period, qStart, qEnd);

  const dateFilter = {};
  if (startDate) dateFilter.$gte = startDate;
  if (endDate) dateFilter.$lte = endDate;
  const hasDateFilter = Object.keys(dateFilter).length > 0;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  const [
    // 1. Customer statistics
    totalCustomers,
    activeCustomers,
    inactiveCustomers,
    newCustomersToday,
    newCustomersThisMonth,

    // 2. Chef statistics
    totalChefs,
    pendingChefs,
    approvedChefs,
    rejectedChefs,
    suspendedChefs,
    activeChefs,

    // 3. Order statistics
    orderStatsAgg,

    // 4. Subscription statistics
    subStatsAgg,

    // 5. Food statistics
    totalFoods,
    activeFoods,
    inactiveFoods,
    totalCategories,

    // 6. Segregated Financial overview
    financeOverview,
  ] = await Promise.all([
    // Customers
    User.countDocuments({ role: "customer" }),
    User.countDocuments({ role: "customer", isActive: true }),
    User.countDocuments({ role: "customer", isActive: false }),
    User.countDocuments({ role: "customer", createdAt: { $gte: todayStart } }),
    User.countDocuments({ role: "customer", createdAt: { $gte: thisMonthStart } }),

    // Chefs
    ChefProfile.countDocuments(),
    ChefProfile.countDocuments({ approvalStatus: "pending" }),
    ChefProfile.countDocuments({ approvalStatus: "approved" }),
    ChefProfile.countDocuments({ approvalStatus: "rejected" }),
    User.countDocuments({ role: "chef", isActive: false }),
    User.countDocuments({ role: "chef", isActive: true }),

    // Orders
    Order.aggregate([
      ...(hasDateFilter ? [{ $match: { createdAt: dateFilter } }] : []),
      { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
    ]),

    // Subscriptions
    Subscription.aggregate([
      ...(hasDateFilter ? [{ $match: { createdAt: dateFilter } }] : []),
      { $group: { _id: "$subscriptionStatus", count: { $sum: 1 } } },
    ]),

    // Food
    Food.countDocuments(),
    Food.countDocuments({ isActive: true, availability: "available" }),
    Food.countDocuments({ $or: [{ isActive: false }, { availability: "unavailable" }] }),
    Category.countDocuments(),

    // Finance overview
    getFinanceOverview({ startDate, endDate }),
  ]);

  // Map order statuses
  const orderStats = {
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

  orderStatsAgg.forEach((item) => {
    if (item._id && orderStats[item._id] !== undefined) {
      orderStats[item._id] = item.count;
    }
    orderStats.total += item.count;
  });

  // Map subscription statuses
  const subscriptionStats = {
    pending_payment: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
    total: 0,
  };

  subStatsAgg.forEach((item) => {
    if (item._id && subscriptionStats[item._id] !== undefined) {
      subscriptionStats[item._id] = item.count;
    }
    subscriptionStats.total += item.count;
  });

  return {
    period: period || "all_time",
    appliedDateRange: {
      startDate: startDate ? startDate.toISOString() : null,
      endDate: endDate ? endDate.toISOString() : null,
    },
    customers: {
      total: totalCustomers,
      active: activeCustomers,
      inactive: inactiveCustomers,
      newToday: newCustomersToday,
      newThisMonth: newCustomersThisMonth,
    },
    chefs: {
      total: totalChefs,
      pendingApproval: pendingChefs,
      approved: approvedChefs,
      rejected: rejectedChefs,
      suspended: suspendedChefs,
      active: activeChefs,
    },
    orders: orderStats,
    subscriptions: subscriptionStats,
    foods: {
      total: totalFoods,
      active: activeFoods,
      inactive: inactiveFoods,
      totalCategories,
    },
    finance: financeOverview,
  };
}
