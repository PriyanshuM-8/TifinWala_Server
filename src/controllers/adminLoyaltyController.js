import {
  getAdminLoyaltyOverview,
  adminAdjustLoyaltyPoints,
  getCustomerLoyaltyBalance,
  getCustomerLoyaltyTransactions,
} from "../Services/loyaltyService.js";
import {
  sweepExpiringAndExpiredCoupons,
  getCustomerCoupons,
} from "../Services/rewardCouponService.js";
import RewardCoupon from "../Models/RewardCoupon.js";
import User from "../Models/User.js";
import { logAdminAction } from "../Services/auditLogService.js";

/**
 * GET /api/admin/loyalty/overview
 */
export const getLoyaltyOverview = async (req, res, next) => {
  try {
    const overview = await getAdminLoyaltyOverview();
    const [activeCoupons, redeemedCoupons, expiredCoupons] = await Promise.all([
      RewardCoupon.countDocuments({ status: "active" }),
      RewardCoupon.countDocuments({ status: "redeemed" }),
      RewardCoupon.countDocuments({ status: "expired" }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...overview,
        couponStats: {
          activeCoupons,
          redeemedCoupons,
          expiredCoupons,
          totalCouponsIssued: activeCoupons + redeemedCoupons + expiredCoupons,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/loyalty/customers/:customerId
 */
export const getCustomerLoyaltyProfile = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    const user = await User.findById(customerId).select("name email phone role isActive");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    const [balance, transactionsData, couponsData] = await Promise.all([
      getCustomerLoyaltyBalance(customerId),
      getCustomerLoyaltyTransactions(customerId, { page: 1, limit: 10 }),
      getCustomerCoupons(customerId, { page: 1, limit: 10 }),
    ]);

    return res.status(200).json({
      success: true,
      customer: user,
      loyalty: balance,
      recentTransactions: transactionsData.transactions,
      recentCoupons: couponsData.coupons,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/loyalty/adjust-points
 */
export const adjustCustomerPoints = async (req, res, next) => {
  try {
    const { customerId, pointsDelta, auditReason } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "customerId is required.",
      });
    }

    const result = await adminAdjustLoyaltyPoints({
      adminUserId: req.user._id,
      customerId,
      pointsDelta: Number(pointsDelta),
      auditReason,
    });

    await logAdminAction({
      adminId: req.user._id,
      actionType: "loyalty_point_adjustment",
      targetEntityType: "CustomerLoyaltyAccount",
      targetEntityId: customerId,
      previousState: null,
      newState: { pointsDelta: Number(pointsDelta) },
      reason: `Loyalty points adjusted by ${pointsDelta} points. Reason: ${auditReason || "Admin adjustment"}`,
    });

    return res.status(200).json({
      success: true,
      message: "Customer loyalty points adjusted successfully.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/loyalty/coupons
 */
export const getAllCoupons = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.customerId) {
      query.customerId = req.query.customerId;
    }
    if (req.query.couponCode) {
      query.couponCode = req.query.couponCode.trim().toUpperCase();
    }

    const [coupons, total] = await Promise.all([
      RewardCoupon.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("customerId", "name email phone")
        .populate("redemptionId")
        .lean(),
      RewardCoupon.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      coupons,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/loyalty/coupons/sweep-expiries
 */
export const triggerExpirySweep = async (req, res, next) => {
  try {
    const sweepResult = await sweepExpiringAndExpiredCoupons();
    return res.status(200).json({
      success: true,
      message: "Coupon expiry sweep executed successfully.",
      data: sweepResult,
    });
  } catch (error) {
    next(error);
  }
};
