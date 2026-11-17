import {
  getCustomerLoyaltyBalance,
  getCustomerLoyaltyTransactions,
} from "../Services/loyaltyService.js";
import {
  getCustomerCoupons,
} from "../Services/rewardCouponService.js";
import {
  redeemRewardCoupon,
  getCustomerRedemptions,
} from "../Services/rewardRedemptionService.js";
import InAppNotification from "../Models/InAppNotification.js";

/**
 * GET /api/customer/loyalty/balance
 */
export const getLoyaltyBalance = async (req, res, next) => {
  try {
    const data = await getCustomerLoyaltyBalance(req.user._id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/loyalty/transactions
 */
export const getLoyaltyTransactions = async (req, res, next) => {
  try {
    const data = await getCustomerLoyaltyTransactions(req.user._id, req.query);
    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/loyalty/coupons
 */
export const getRewardCoupons = async (req, res, next) => {
  try {
    const data = await getCustomerCoupons(req.user._id, req.query);
    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/customer/loyalty/coupons/:couponId/redeem
 */
export const redeemCoupon = async (req, res, next) => {
  try {
    const couponId = req.params.couponId || req.body.couponId;
    const {
      chefId,
      redemptionDateKey,
      deliveryType,
      addressId,
      manualAddress,
      meals,
    } = req.body;

    const result = await redeemRewardCoupon({
      customerId: req.user._id,
      couponId,
      chefId,
      redemptionDateKey,
      deliveryType,
      addressId,
      manualAddress,
      meals,
    });

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/loyalty/redemptions
 */
export const getCustomerRedemptionList = async (req, res, next) => {
  try {
    const data = await getCustomerRedemptions(req.user._id);
    return res.status(200).json({
      success: true,
      redemptions: data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/loyalty/notifications
 */
export const getInAppNotifications = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 15));
    const skip = (page - 1) * limit;

    const query = { recipientId: req.user._id };
    if (req.query.isRead !== undefined) {
      query.isRead = req.query.isRead === "true";
    }

    const [notifications, total, unreadCount] = await Promise.all([
      InAppNotification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      InAppNotification.countDocuments(query),
      InAppNotification.countDocuments({ recipientId: req.user._id, isRead: false }),
    ]);

    return res.status(200).json({
      success: true,
      notifications,
      unreadCount,
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
 * PATCH /api/customer/loyalty/notifications/:notificationId/read
 */
export const markNotificationRead = async (req, res, next) => {
  try {
    const notification = await InAppNotification.findOneAndUpdate(
      {
        _id: req.params.notificationId,
        recipientId: req.user._id,
      },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      notification,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/customer/loyalty/notifications/read-all
 */
export const markAllNotificationsRead = async (req, res, next) => {
  try {
    await InAppNotification.updateMany(
      { recipientId: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
    });
  } catch (error) {
    next(error);
  }
};
