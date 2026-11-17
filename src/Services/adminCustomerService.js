import mongoose from "mongoose";
import User from "../Models/User.js";
import Order from "../Models/Order.js";
import Subscription from "../Models/Subscription.js";
import CustomerAddress from "../Models/CustomerAddress.js";
import CustomerLoyaltyAccount from "../Models/CustomerLoyaltyAccount.js";
import LoyaltyTransaction from "../Models/LoyaltyTransaction.js";
import RewardCoupon from "../Models/RewardCoupon.js";
import RewardRedemption from "../Models/RewardRedemption.js";
import { logAdminAction } from "./auditLogService.js";

/**
 * ADMIN: Lists all registered customers with search, status filter, and pagination.
 */
export async function listAllCustomers({ search, isActive, page = 1, limit = 20 }) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = { role: "customer" };

  if (isActive !== undefined && isActive !== "") {
    query.isActive = isActive === "true" || isActive === true;
  }

  if (search && typeof search === "string" && search.trim().length > 0) {
    const s = search.trim();
    query.$or = [
      { name: { $regex: s, $options: "i" } },
      { email: { $regex: s, $options: "i" } },
      { phone: { $regex: s, $options: "i" } },
    ];
  }

  const [totalRecords, customers] = await Promise.all([
    User.countDocuments(query),
    User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    customers,
  };
}

/**
 * ADMIN: Detailed customer profile inspection.
 */
export async function getCustomerDetails(customerId) {
  const customer = await User.findOne({ _id: customerId, role: "customer" })
    .select("-password")
    .lean();

  if (!customer) {
    const error = new Error("Customer not found.");
    error.statusCode = 404;
    throw error;
  }

  const [addressCount, orderCount, subscriptionCount, loyaltyAccount] = await Promise.all([
    CustomerAddress.countDocuments({ customerId }),
    Order.countDocuments({ customerId }),
    Subscription.countDocuments({ customerId }),
    CustomerLoyaltyAccount.findOne({ customerId }).lean(),
  ]);

  return {
    customer,
    stats: {
      addressCount,
      orderCount,
      subscriptionCount,
      loyaltyUnits: loyaltyAccount?.balanceUnits || 0,
      loyaltyPoints: Number(((loyaltyAccount?.balanceUnits || 0) / 3).toFixed(4)),
      lifetimeEarnedUnits: loyaltyAccount?.lifetimeEarnedUnits || 0,
      lifetimeRedeemedUnits: loyaltyAccount?.lifetimeRedeemedUnits || 0,
    },
  };
}

/**
 * ADMIN: Activate or deactivate customer account with mandatory audit logging.
 */
export async function updateCustomerStatus(customerId, adminUserId, { isActive, reason }) {
  if (isActive === undefined) {
    const error = new Error("isActive boolean is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    const error = new Error("Reason for customer status change must be at least 3 characters.");
    error.statusCode = 400;
    throw error;
  }

  const customer = await User.findOne({ _id: customerId, role: "customer" });
  if (!customer) {
    const error = new Error("Customer not found.");
    error.statusCode = 404;
    throw error;
  }

  const previousState = {
    isActive: customer.isActive,
  };

  customer.isActive = Boolean(isActive);
  await customer.save();

  const newState = {
    isActive: customer.isActive,
  };

  // Record audit log
  await logAdminAction({
    adminId: adminUserId,
    actionType: "customer_status_change",
    targetEntityType: "User",
    targetEntityId: customer._id,
    previousState,
    newState,
    reason: `Customer '${customer.name}' account ${customer.isActive ? "activated" : "deactivated"}. Reason: ${reason.trim()}`,
  });

  return customer;
}

/**
 * ADMIN: Returns paginated order history for a customer.
 */
export async function getCustomerOrders(customerId, { page = 1, limit = 10, orderStatus }) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (numericPage - 1) * numericLimit;

  const query = { customerId };
  if (orderStatus) query.orderStatus = orderStatus;

  const [totalRecords, orders] = await Promise.all([
    Order.countDocuments(query),
    Order.find(query)
      .sort({ createdAt: -1 })
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
    orders,
  };
}

/**
 * ADMIN: Returns paginated subscription history for a customer.
 */
export async function getCustomerSubscriptions(customerId, { page = 1, limit = 10 }) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (numericPage - 1) * numericLimit;

  const query = { customerId };

  const [totalRecords, subscriptions] = await Promise.all([
    Subscription.countDocuments(query),
    Subscription.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    subscriptions,
  };
}

/**
 * ADMIN: Returns comprehensive loyalty rewards and coupons history for a customer.
 */
export async function getCustomerRewardsOverview(customerId) {
  const [loyaltyAccount, transactions, coupons, redemptions] = await Promise.all([
    CustomerLoyaltyAccount.findOne({ customerId }).lean(),
    LoyaltyTransaction.find({ customerId }).sort({ createdAt: -1 }).limit(50).lean(),
    RewardCoupon.find({ customerId }).sort({ createdAt: -1 }).lean(),
    RewardRedemption.find({ customerId }).sort({ createdAt: -1 }).lean(),
  ]);

  return {
    loyaltyAccount: loyaltyAccount || {
      balanceUnits: 0,
      lifetimeEarnedUnits: 0,
      lifetimeRedeemedUnits: 0,
    },
    loyaltyPoints: Number(((loyaltyAccount?.balanceUnits || 0) / 3).toFixed(4)),
    recentTransactions: transactions,
    coupons,
    redemptions,
  };
}
