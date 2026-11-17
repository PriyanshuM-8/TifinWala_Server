import crypto from "crypto";
import RewardCoupon from "../Models/RewardCoupon.js";
import CustomerLoyaltyAccount from "../Models/CustomerLoyaltyAccount.js";
import LoyaltyTransaction from "../Models/LoyaltyTransaction.js";
import User from "../Models/User.js";
import {
  notifyCouponGenerated,
  notifyCouponExpiringSoon,
  notifyCouponExpired,
} from "./rewardNotificationService.js";

/**
 * Generate a unique coupon code with format: GKS-REW-XXXXXX
 */
export const generateUniqueCouponCode = async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
    const code = `GKS-REW-${randomHex}`;
    const exists = await RewardCoupon.exists({ couponCode: code });
    if (!exists) return code;
  }
  return `GKS-REW-${Date.now().toString().slice(-6)}`;
};

/**
 * Automatically evaluates customer's internal units balance and issues
 * 100-point (300 units) coupons for every complete 300-unit threshold.
 */
export const checkAndGenerateCouponsForCustomer = async (customerId) => {
  const generatedCoupons = [];

  // Loop in case customer balance qualifies for multiple coupons (e.g. 600 units -> 2 coupons)
  while (true) {
    const account = await CustomerLoyaltyAccount.findOne({ customerId });
    if (!account || account.balanceUnits < 300) {
      break;
    }

    const previousBalanceUnits = account.balanceUnits;
    const newBalanceUnits = previousBalanceUnits - 300;
    const newLifetimeRedeemedUnits = (account.lifetimeRedeemedUnits || 0) + 300;

    // Concurrency-safe atomic deduction
    const updatedAccount = await CustomerLoyaltyAccount.findOneAndUpdate(
      { customerId, balanceUnits: { $gte: 300 } },
      {
        $inc: { balanceUnits: -300, lifetimeRedeemedUnits: 300 },
      },
      { new: true }
    );

    if (!updatedAccount) {
      // Balance was modified concurrently or fell below 300
      break;
    }

    const couponCode = await generateUniqueCouponCode();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days validity

    const coupon = await RewardCoupon.create({
      couponCode,
      customerId,
      pointsCost: 100,
      unitsCost: 300,
      status: "active",
      generatedAt: new Date(),
      expiresAt,
    });

    const balanceAfterPoints = Number((updatedAccount.balanceUnits / 3).toFixed(4));

    // Record ledger debit transaction
    await LoyaltyTransaction.create({
      customerId,
      transactionType: "debit",
      source: "coupon_redemption",
      units: 300,
      points: 100.0,
      balanceAfterUnits: updatedAccount.balanceUnits,
      balanceAfterPoints,
      couponId: coupon._id,
      auditReason: `Automatic 100-point Reward Coupon generated (${couponCode})`,
    });

    generatedCoupons.push(coupon);

    // Notify customer
    try {
      const user = await User.findById(customerId).select("name email");
      if (user) {
        await notifyCouponGenerated({ user, coupon });
      }
    } catch (notifErr) {
      console.error(
        "[RewardCouponService] Notification error on coupon generation:",
        notifErr.message
      );
    }
  }

  return generatedCoupons;
};

/**
 * Get customer coupons with pagination and optional status filter.
 */
export const getCustomerCoupons = async (
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
 * Sweeps all active coupons to detect:
 * 1. Expired coupons (expiresAt < now) -> marks expired
 * 2. 1-day expiry window (expiresAt <= now + 24 hours && !notified1Day)
 * 3. 7-day expiry window (expiresAt <= now + 7 days && !notified7Days)
 */
export const sweepExpiringAndExpiredCoupons = async () => {
  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let expiredCount = 0;
  let notified1DayCount = 0;
  let notified7DaysCount = 0;

  // 1. Mark expired coupons
  const expiredCoupons = await RewardCoupon.find({
    status: "active",
    expiresAt: { $lt: now },
  });

  for (const coupon of expiredCoupons) {
    coupon.status = "expired";
    await coupon.save();
    expiredCount++;

    const user = await User.findById(coupon.customerId).select("name email");
    if (user) {
      await notifyCouponExpired({ user, coupon });
    }
  }

  // 2. Notify 1-day expiry reminder (highest urgency)
  const dueFor1DayNotice = await RewardCoupon.find({
    status: "active",
    expiresAt: { $gte: now, $lte: in24Hours },
    notified1Day: false,
  });

  for (const coupon of dueFor1DayNotice) {
    coupon.notified1Day = true;
    await coupon.save();
    notified1DayCount++;

    const user = await User.findById(coupon.customerId).select("name email");
    if (user) {
      await notifyCouponExpiringSoon({ user, coupon, daysRemaining: 1 });
    }
  }

  // 3. Notify 7-day expiry reminder
  const dueFor7DayNotice = await RewardCoupon.find({
    status: "active",
    expiresAt: { $gt: in24Hours, $lte: in7Days },
    notified7Days: false,
  });

  for (const coupon of dueFor7DayNotice) {
    coupon.notified7Days = true;
    await coupon.save();
    notified7DaysCount++;

    const user = await User.findById(coupon.customerId).select("name email");
    if (user) {
      await notifyCouponExpiringSoon({ user, coupon, daysRemaining: 7 });
    }
  }

  return {
    success: true,
    sweptAt: now,
    summary: {
      expiredCount,
      notified1DayCount,
      notified7DaysCount,
    },
  };
};
