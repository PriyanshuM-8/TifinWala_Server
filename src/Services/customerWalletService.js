import CustomerLoyaltyAccount from "../Models/CustomerLoyaltyAccount.js";
import LoyaltyTransaction from "../Models/LoyaltyTransaction.js";
import RewardCoupon from "../Models/RewardCoupon.js";
import RewardRedemption from "../Models/RewardRedemption.js";

/**
 * Utility helper to convert integer internal units to 4-decimal points number.
 */
const unitsToPoints = (units) => Number(((units || 0) / 3).toFixed(4));

/**
 * Returns comprehensive customer reward wallet overview aggregated
 * strictly from Phase 8 sources of truth without creating duplicate balances.
 */
export const getCustomerRewardWallet = async (customerId) => {
  let account = await CustomerLoyaltyAccount.findOne({ customerId });

  if (!account) {
    account = await CustomerLoyaltyAccount.create({
      customerId,
      balanceUnits: 0,
      lifetimeEarnedUnits: 0,
      lifetimeRedeemedUnits: 0,
    });
  }

  // Aggregate coupon counts by status
  const [activeCoupons, reservedCoupons, redeemedCoupons, expiredCoupons] =
    await Promise.all([
      RewardCoupon.find({ customerId, status: "active" })
        .sort({ expiresAt: 1 })
        .lean(),
      RewardCoupon.find({ customerId, status: "locked_in_redemption" })
        .sort({ createdAt: -1 })
        .lean(),
      RewardCoupon.find({ customerId, status: "redeemed" })
        .sort({ redeemedAt: -1 })
        .lean(),
      RewardCoupon.find({ customerId, status: "expired" })
        .sort({ expiresAt: -1 })
        .lean(),
    ]);

  // Aggregate points flow breakdown from LoyaltyTransaction ledger
  const [pointsBreakdown] = await LoyaltyTransaction.aggregate([
    { $match: { customerId: account.customerId } },
    {
      $group: {
        _id: null,
        totalEarnedFromMealsUnits: {
          $sum: {
            $cond: [{ $eq: ["$source", "meal_completion"] }, "$units", 0],
          },
        },
        totalUsedForCouponsUnits: {
          $sum: {
            $cond: [{ $eq: ["$source", "coupon_redemption"] }, "$units", 0],
          },
        },
        adminAdjustmentsUnits: {
          $sum: {
            $cond: [{ $eq: ["$source", "admin_adjustment"] }, "$units", 0],
          },
        },
      },
    },
  ]);

  const earnedFromMealsPoints = unitsToPoints(
    pointsBreakdown?.totalEarnedFromMealsUnits || 0
  );
  const usedForCouponsPoints = unitsToPoints(
    pointsBreakdown?.totalUsedForCouponsUnits || 0
  );
  const adminAdjustmentsPoints = unitsToPoints(
    pointsBreakdown?.adminAdjustmentsUnits || 0
  );

  return {
    customerId: account.customerId,
    pointsBalance: unitsToPoints(account.balanceUnits),
    balanceUnits: account.balanceUnits,
    lifetimeEarnedPoints: unitsToPoints(account.lifetimeEarnedUnits),
    lifetimeRedeemedPoints: unitsToPoints(account.lifetimeRedeemedUnits),
    pointsNeededForNextCoupon: Math.max(
      0,
      Number((100 - unitsToPoints(account.balanceUnits % 300)).toFixed(4))
    ),
    pointsFlow: {
      pointsEarnedFromSubscriptionMeals: earnedFromMealsPoints,
      pointsUsedForRewardCoupons: usedForCouponsPoints,
      adminAdjustments: adminAdjustmentsPoints,
    },
    couponSummary: {
      availableCouponsCount: activeCoupons.length,
      reservedCouponsCount: reservedCoupons.length,
      redeemedCouponsCount: redeemedCoupons.length,
      expiredCouponsCount: expiredCoupons.length,
      totalCouponsIssued:
        activeCoupons.length +
        reservedCoupons.length +
        redeemedCoupons.length +
        expiredCoupons.length,
    },
    availableCoupons: activeCoupons.map((c) => ({
      couponId: c._id,
      couponCode: c.couponCode,
      status: c.status,
      pointsCost: c.pointsCost,
      expiresAt: c.expiresAt,
      daysRemaining: Math.max(
        0,
        Math.ceil((new Date(c.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))
      ),
    })),
    reservedCoupons: reservedCoupons.map((c) => ({
      couponId: c._id,
      couponCode: c.couponCode,
      status: c.status,
      redemptionId: c.redemptionId,
      expiresAt: c.expiresAt,
    })),
  };
};

/**
 * Returns paginated customer loyalty ledger movements.
 */
export const getCustomerRewardTransactions = async (
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
 * Returns categorized customer coupons with filter options.
 */
export const getCustomerRewardCoupons = async (
  customerId,
  { status, page = 1, limit = 10 }
) => {
  const query = { customerId };
  if (status) {
    query.status = status;
  }

  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));
  const skip = (numericPage - 1) * numericLimit;

  const [coupons, total] = await Promise.all([
    RewardCoupon.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("redemptionId")
      .lean(),
    RewardCoupon.countDocuments(query),
  ]);

  return {
    coupons,
    pagination: {
      total,
      page: numericPage,
      limit: numericLimit,
      pages: Math.ceil(total / numericLimit) || 1,
    },
  };
};

/**
 * Returns customer reward redemptions history.
 */
export const getCustomerRewardRedemptions = async (customerId) => {
  return RewardRedemption.find({ customerId })
    .sort({ createdAt: -1 })
    .populate("chefId", "name email")
    .lean();
};
