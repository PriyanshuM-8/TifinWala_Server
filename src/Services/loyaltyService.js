import CustomerLoyaltyAccount from "../Models/CustomerLoyaltyAccount.js";
import LoyaltyTransaction from "../Models/LoyaltyTransaction.js";
import SubscriptionMealOrder from "../Models/SubscriptionMealOrder.js";
import User from "../Models/User.js";
import { checkAndGenerateCouponsForCustomer } from "./rewardCouponService.js";
import {
  notifyLoyaltyPointsEarned,
  notifyAdminPointsAdjustment,
} from "./rewardNotificationService.js";

/**
 * Utility helper to convert integer internal units to 4-decimal points number.
 */
export const unitsToPoints = (units) => Number(((units || 0) / 3).toFixed(4));

/**
 * Utility helper to convert decimal points to nearest exact internal units (1 pt = 3 units).
 */
export const pointsToUnits = (points) => Math.round((points || 0) * 3);

/**
 * Evaluates all meals for a customer on a given calendar date (scheduledDateKey)
 * across ALL subscriptions and chefs.
 *
 * Rules:
 * 1. If any meal is skipped, cancelled, rejected, or expired -> 0 points for the day.
 * 2. If any meal is still in progress (scheduled/accepted/preparing/ready/out) -> defer evaluation.
 * 3. If all meals are delivered -> award exactly 5 internal units per delivered meal
 *    (e.g., 3 meals = 15 units = 5.0000 points).
 * 4. Exactly-once idempotency per customer per scheduledDateKey.
 */
export const evaluateAndCreditDailyLoyaltyPoints = async ({
  customerId,
  scheduledDateKey,
}) => {
  if (!customerId || !scheduledDateKey) {
    return { evaluated: false, reason: "Missing customerId or scheduledDateKey" };
  }

  // Find all scheduled meals for this customer on this date across all active subscriptions
  const meals = await SubscriptionMealOrder.find({
    customerId,
    scheduledDateKey,
  }).lean();

  if (!meals || meals.length === 0) {
    return { evaluated: false, reason: "No meals scheduled for customer on this date" };
  }

  // Check for disqualifying statuses (strict daily eligibility)
  const disqualifiedStatuses = ["skipped", "cancelled", "rejected", "expired"];
  const hasDisqualifiedMeal = meals.some((m) =>
    disqualifiedStatuses.includes(m.orderStatus)
  );

  if (hasDisqualifiedMeal) {
    return {
      evaluated: true,
      eligible: false,
      reason:
        "Daily loyalty points forfeited because one or more meals were skipped, rejected, cancelled, or expired.",
      mealsCount: meals.length,
      pointsAwarded: 0,
    };
  }

  // Check for pending/in-progress statuses
  const inProgressStatuses = [
    "scheduled",
    "accepted",
    "preparing",
    "ready_for_pickup",
    "out_for_delivery",
  ];
  const hasPendingMeal = meals.some((m) =>
    inProgressStatuses.includes(m.orderStatus)
  );

  if (hasPendingMeal) {
    return {
      evaluated: true,
      eligible: false,
      deferred: true,
      reason:
        "Points deferred: One or more scheduled meals are still in progress for this date.",
      mealsCount: meals.length,
    };
  }

  // Verify all meals are delivered
  const allDelivered = meals.every((m) => m.orderStatus === "delivered");
  if (!allDelivered) {
    return {
      evaluated: true,
      eligible: false,
      reason: "Not all scheduled meals have reached delivered status.",
    };
  }

  // Calculate points: each delivered meal earns 5 internal units (5/3 points)
  // E.g., 3 meals * 5 units = 15 units = 5.0000 points.
  const earnedUnits = meals.length * 5;
  const earnedPoints = unitsToPoints(earnedUnits);
  const idempotencyKey = `EARNED_${customerId}_${scheduledDateKey}`;

  // Idempotency check: prevent duplicate credit under concurrent deliveries
  const existingTx = await LoyaltyTransaction.findOne({ idempotencyKey });
  if (existingTx) {
    return {
      evaluated: true,
      eligible: true,
      alreadyCredited: true,
      transactionId: existingTx._id,
      points: existingTx.points,
    };
  }

  // Update customer loyalty account atomically
  const updatedAccount = await CustomerLoyaltyAccount.findOneAndUpdate(
    { customerId },
    {
      $inc: { balanceUnits: earnedUnits, lifetimeEarnedUnits: earnedUnits },
      $set: { lastActiveDateKey: scheduledDateKey },
    },
    { new: true, upsert: true }
  );

  const balanceAfterPoints = unitsToPoints(updatedAccount.balanceUnits);

  // Record ledger credit transaction
  const transaction = await LoyaltyTransaction.create({
    customerId,
    transactionType: "credit",
    source: "meal_completion",
    units: earnedUnits,
    points: earnedPoints,
    balanceAfterUnits: updatedAccount.balanceUnits,
    balanceAfterPoints,
    scheduledDateKey,
    mealOrderIds: meals.map((m) => m._id),
    idempotencyKey,
    auditReason: `Earned ${earnedPoints.toFixed(4)} loyalty points for completing ${meals.length} meals on ${scheduledDateKey}`,
  });

  // Notify customer
  try {
    const user = await User.findById(customerId).select("name email");
    if (user) {
      await notifyLoyaltyPointsEarned({
        user,
        points: earnedPoints,
        units: earnedUnits,
        scheduledDateKey,
      });
    }
  } catch (err) {
    console.error("[LoyaltyService] Customer notification error:", err.message);
  }

  // Check if balance qualifies for automated 100-point (300 units) coupon generation
  const generatedCoupons = await checkAndGenerateCouponsForCustomer(customerId);

  return {
    evaluated: true,
    eligible: true,
    credited: true,
    earnedUnits,
    earnedPoints,
    newBalancePoints: unitsToPoints(updatedAccount.balanceUnits),
    transactionId: transaction._id,
    couponsGenerated: generatedCoupons.map((c) => ({
      couponId: c._id,
      couponCode: c.couponCode,
      expiresAt: c.expiresAt,
    })),
  };
};

/**
 * Retrieve customer loyalty balance and summary statistics.
 */
export const getCustomerLoyaltyBalance = async (customerId) => {
  let account = await CustomerLoyaltyAccount.findOne({ customerId });

  if (!account) {
    account = await CustomerLoyaltyAccount.create({
      customerId,
      balanceUnits: 0,
      lifetimeEarnedUnits: 0,
      lifetimeRedeemedUnits: 0,
    });
  }

  return {
    customerId: account.customerId,
    balanceUnits: account.balanceUnits,
    pointsBalance: unitsToPoints(account.balanceUnits),
    lifetimeEarnedPoints: unitsToPoints(account.lifetimeEarnedUnits),
    lifetimeRedeemedPoints: unitsToPoints(account.lifetimeRedeemedUnits),
    lastActiveDateKey: account.lastActiveDateKey || null,
    pointsNeededForNextCoupon: Math.max(
      0,
      Number((100 - unitsToPoints(account.balanceUnits % 300)).toFixed(4))
    ),
  };
};

/**
 * Get paginated loyalty transactions ledger for a customer.
 */
export const getCustomerLoyaltyTransactions = async (
  customerId,
  { page = 1, limit = 20, transactionType }
) => {
  const query = { customerId };
  if (transactionType) {
    query.transactionType = transactionType;
  }

  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const [transactions, total] = await Promise.all([
    LoyaltyTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("couponId", "couponCode status")
      .lean(),
    LoyaltyTransaction.countDocuments(query),
  ]);

  return {
    transactions,
    pagination: {
      total,
      page: numericPage,
      limit: numericLimit,
      pages: Math.ceil(total / numericLimit) || 1,
    },
  };
};

/**
 * Admin manual points adjustment with mandatory audit log.
 */
export const adminAdjustLoyaltyPoints = async ({
  adminUserId,
  customerId,
  pointsDelta,
  auditReason,
}) => {
  if (typeof pointsDelta !== "number" || pointsDelta === 0) {
    const error = new Error("pointsDelta must be a non-zero number.");
    error.statusCode = 400;
    throw error;
  }

  if (!auditReason || typeof auditReason !== "string" || auditReason.trim().length < 5) {
    const error = new Error("A detailed auditReason (at least 5 characters) is required.");
    error.statusCode = 400;
    throw error;
  }

  const unitsDelta = pointsToUnits(pointsDelta);
  const transactionType = unitsDelta > 0 ? "credit" : "debit";
  const absUnits = Math.abs(unitsDelta);
  const absPoints = Math.abs(pointsDelta);

  let account = await CustomerLoyaltyAccount.findOne({ customerId });
  if (!account) {
    if (unitsDelta < 0) {
      const error = new Error("Customer has no loyalty balance to deduct from.");
      error.statusCode = 400;
      throw error;
    }
    account = await CustomerLoyaltyAccount.create({
      customerId,
      balanceUnits: 0,
      lifetimeEarnedUnits: 0,
      lifetimeRedeemedUnits: 0,
    });
  }

  if (unitsDelta < 0 && account.balanceUnits < absUnits) {
    const error = new Error(
      `Insufficient points balance. Current balance is ${unitsToPoints(
        account.balanceUnits
      )} points, cannot deduct ${absPoints} points.`
    );
    error.statusCode = 400;
    throw error;
  }

  // Atomic update
  const incQuery = { balanceUnits: unitsDelta };
  if (unitsDelta > 0) {
    incQuery.lifetimeEarnedUnits = unitsDelta;
  } else {
    incQuery.lifetimeRedeemedUnits = absUnits;
  }

  const updatedAccount = await CustomerLoyaltyAccount.findOneAndUpdate(
    {
      customerId,
      ...(unitsDelta < 0 ? { balanceUnits: { $gte: absUnits } } : {}),
    },
    { $inc: incQuery },
    { new: true }
  );

  if (!updatedAccount) {
    const error = new Error("Concurrent update conflict while adjusting loyalty points.");
    error.statusCode = 409;
    throw error;
  }

  const balanceAfterPoints = unitsToPoints(updatedAccount.balanceUnits);

  const transaction = await LoyaltyTransaction.create({
    customerId,
    transactionType,
    source: "admin_adjustment",
    units: absUnits,
    points: absPoints,
    balanceAfterUnits: updatedAccount.balanceUnits,
    balanceAfterPoints,
    adminUserId,
    auditReason: auditReason.trim(),
  });

  // Notify customer
  try {
    const user = await User.findById(customerId).select("name email");
    if (user) {
      await notifyAdminPointsAdjustment({ user, transaction });
    }
  } catch (err) {
    console.error("[LoyaltyService] Admin adjustment notification failed:", err.message);
  }

  // If points were credited, check if customer qualifies for a coupon
  let generatedCoupons = [];
  if (unitsDelta > 0) {
    generatedCoupons = await checkAndGenerateCouponsForCustomer(customerId);
  }

  return {
    success: true,
    transaction,
    updatedAccount: {
      customerId: updatedAccount.customerId,
      balanceUnits: updatedAccount.balanceUnits,
      pointsBalance: balanceAfterPoints,
    },
    couponsGenerated: generatedCoupons.map((c) => ({
      couponId: c._id,
      couponCode: c.couponCode,
    })),
  };
};

/**
 * Get system-wide loyalty overview statistics for admin.
 */
export const getAdminLoyaltyOverview = async () => {
  const [accountStats] = await CustomerLoyaltyAccount.aggregate([
    {
      $group: {
        _id: null,
        totalAccounts: { $sum: 1 },
        totalActiveBalanceUnits: { $sum: "$balanceUnits" },
        totalLifetimeEarnedUnits: { $sum: "$lifetimeEarnedUnits" },
        totalLifetimeRedeemedUnits: { $sum: "$lifetimeRedeemedUnits" },
      },
    },
  ]);

  const activePoints = unitsToPoints(accountStats?.totalActiveBalanceUnits || 0);
  const lifetimeEarnedPoints = unitsToPoints(accountStats?.totalLifetimeEarnedUnits || 0);
  const lifetimeRedeemedPoints = unitsToPoints(accountStats?.totalLifetimeRedeemedUnits || 0);

  return {
    totalCustomerAccounts: accountStats?.totalAccounts || 0,
    totalActivePointsInCirculation: activePoints,
    totalLifetimeEarnedPoints: lifetimeEarnedPoints,
    totalLifetimeRedeemedPoints: lifetimeRedeemedPoints,
  };
};
