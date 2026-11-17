import RewardCoupon from "../Models/RewardCoupon.js";
import RewardRedemption from "../Models/RewardRedemption.js";
import User from "../Models/User.js";
import ChefProfile from "../Models/ChefProfile.js";
import Food from "../Models/Food.js";
import CustomerAddress from "../Models/CustomerAddress.js";
import { createInAppNotification } from "./rewardNotificationService.js";
import {
  recordPendingChefEarning,
  confirmChefEarning,
} from "./chefWalletService.js";

/**
 * Redeem an active 100-point Reward Coupon for a 1-day 3-meal plan
 * from a single approved and active home chef.
 */
export const redeemRewardCoupon = async ({
  customerId,
  couponId,
  chefId,
  redemptionDateKey,
  deliveryType = "delivery",
  addressId,
  manualAddress,
  meals,
}) => {
  // 1. Validate date key format (YYYY-MM-DD)
  if (!redemptionDateKey || !/^\d{4}-\d{2}-\d{2}$/.test(redemptionDateKey)) {
    const error = new Error("redemptionDateKey is required in YYYY-MM-DD format.");
    error.statusCode = 400;
    throw error;
  }

  // 2. Validate Coupon
  const coupon = await RewardCoupon.findOne({ _id: couponId, customerId });
  if (!coupon) {
    const error = new Error("Reward coupon not found or does not belong to you.");
    error.statusCode = 404;
    throw error;
  }

  if (coupon.status !== "active") {
    const error = new Error(
      `Coupon cannot be redeemed. Current status is '${coupon.status}'.`
    );
    error.statusCode = 400;
    throw error;
  }

  if (new Date(coupon.expiresAt) < new Date()) {
    coupon.status = "expired";
    await coupon.save();
    const error = new Error("This reward coupon has expired and can no longer be redeemed.");
    error.statusCode = 400;
    throw error;
  }

  // 3. Validate Single Chef (Must be active and approved)
  const chefUser = await User.findOne({ _id: chefId, role: "chef", isActive: true });
  if (!chefUser) {
    const error = new Error("Selected chef does not exist or account is inactive.");
    error.statusCode = 404;
    throw error;
  }

  const chefProfile = await ChefProfile.findOne({
    $or: [{ userId: chefId }, { chefId: chefId }],
  });

  const isChefApproved =
    chefProfile &&
    (chefProfile.approvalStatus === "approved" || chefProfile.isApproved === true);

  if (!isChefApproved) {
    const error = new Error("Selected chef is not currently approved for meal fulfillment.");
    error.statusCode = 400;
    throw error;
  }

  if (chefProfile.isActive === false) {
    const error = new Error("Selected chef profile is currently inactive.");
    error.statusCode = 400;
    throw error;
  }

  // 4. Validate Delivery Details
  let resolvedAddress = null;
  if (deliveryType === "delivery") {
    if (addressId) {
      const savedAddress = await CustomerAddress.findOne({
        _id: addressId,
        $or: [{ userId: customerId }, { customerId }],
      });
      if (!savedAddress) {
        const error = new Error("Saved customer address not found.");
        error.statusCode = 404;
        throw error;
      }
      resolvedAddress = {
        fullName: savedAddress.fullName,
        addressLine: savedAddress.addressLine,
        city: savedAddress.city,
        state: savedAddress.state,
        postalCode: savedAddress.postalCode || savedAddress.pincode,
        pincode: savedAddress.pincode || savedAddress.postalCode,
        landmark: savedAddress.landmark,
        contactPhone: savedAddress.contactPhone || savedAddress.phone,
        phone: savedAddress.phone || savedAddress.contactPhone,
        location: savedAddress.location,
      };
    } else if (manualAddress) {
      resolvedAddress = manualAddress;
    } else {
      const error = new Error(
        "A valid delivery address is required when deliveryType is 'delivery'."
      );
      error.statusCode = 400;
      throw error;
    }
  }

  // 5. Validate Meals Configuration (Must have Breakfast, Lunch, Dinner from the SAME chef)
  if (!Array.isArray(meals) || meals.length !== 3) {
    const error = new Error(
      "You must configure exactly 3 meals: one Breakfast, one Lunch, and one Dinner."
    );
    error.statusCode = 400;
    throw error;
  }

  const mealTypes = meals.map((m) => m.mealType).sort();
  if (
    mealTypes[0] !== "breakfast" ||
    mealTypes[1] !== "dinner" ||
    mealTypes[2] !== "lunch"
  ) {
    const error = new Error(
      "Meals array must include exactly one 'breakfast', one 'lunch', and one 'dinner'."
    );
    error.statusCode = 400;
    throw error;
  }

  const formattedMealItems = [];
  for (const meal of meals) {
    const foodItem = await Food.findOne({
      _id: meal.foodId,
      chefId,
      isActive: true,
      $or: [{ availability: "available" }, { isAvailable: true }],
    });

    if (!foodItem) {
      const error = new Error(
        `Food item '${meal.foodId}' for ${meal.mealType} is not available from chef '${chefProfile.kitchenName || chefUser.name}'.`
      );
      error.statusCode = 400;
      throw error;
    }

    formattedMealItems.push({
      mealType: meal.mealType,
      foodId: foodItem._id,
      foodName: foodItem.name,
      portionSize: foodItem.portionSize || "Standard",
      status: "pending",
    });
  }

  // 6. Create RewardRedemption Record
  const redemption = await RewardRedemption.create({
    couponId: coupon._id,
    couponCode: coupon.couponCode,
    customerId,
    chefId,
    redemptionDateKey,
    deliveryType,
    deliveryAddress: resolvedAddress,
    meals: formattedMealItems,
    status: "in_progress",
  });

  // 7. Lock Coupon in redemption
  coupon.status = "locked_in_redemption";
  coupon.redemptionId = redemption._id;
  await coupon.save();

  // 8. In-App Notification
  await createInAppNotification({
    recipientId: customerId,
    recipientRole: "customer",
    title: "Reward Order Scheduled! 🍱",
    message: `Your 1-Day 3-Meal reward feast from ${chefProfile.kitchenName || chefUser.name} is scheduled for ${redemptionDateKey}!`,
    type: "redemption_update",
    metadata: {
      redemptionId: redemption._id,
      couponCode: coupon.couponCode,
      redemptionDateKey,
    },
  });

  return {
    success: true,
    message: "Reward coupon redeemed successfully. Your 1-day 3-meal feast is scheduled!",
    redemption,
    coupon: {
      couponId: coupon._id,
      couponCode: coupon.couponCode,
      status: coupon.status,
    },
  };
};

/**
 * Updates status of a reward meal item (chef or admin action).
 * When all 3 meals are marked 'delivered', marks the redemption completed and coupon 'redeemed'.
 */
export const updateRewardMealStatus = async ({
  redemptionId,
  mealType,
  targetStatus,
}) => {
  const redemption = await RewardRedemption.findById(redemptionId);
  if (!redemption) {
    const error = new Error("Reward redemption not found.");
    error.statusCode = 404;
    throw error;
  }

  const mealIndex = redemption.meals.findIndex((m) => m.mealType === mealType);
  if (mealIndex === -1) {
    const error = new Error(`Meal type '${mealType}' not found in redemption.`);
    error.statusCode = 404;
    throw error;
  }

  redemption.meals[mealIndex].status = targetStatus;
  if (targetStatus === "delivered") {
    redemption.meals[mealIndex].deliveredAt = new Date();

    // Phase 9: Record platform-funded reward meal earning for the chef (0% commission)
    try {
      const deliveredMeal = redemption.meals[mealIndex];
      const foodItem = await Food.findById(deliveredMeal.foodId).select("price");
      const grossAmountPaise = Math.round(((foodItem?.price) || 100) * 100);

      await recordPendingChefEarning({
        chefId: redemption.chefId,
        sourceType: "reward_redemption",
        redemptionId: redemption._id,
        orderNumber: `REW-${redemption.couponCode}-${mealType}`,
        grossAmountPaise,
        foodDetails: [
          {
            foodId: deliveredMeal.foodId,
            foodName: deliveredMeal.foodName,
            quantity: 1,
            unitPricePaise: grossAmountPaise,
            itemTotalPaise: grossAmountPaise,
          },
        ],
        earningDateKey: redemption.redemptionDateKey,
      });

      await confirmChefEarning({
        chefId: redemption.chefId,
        redemptionId: redemption._id,
        orderNumber: `REW-${redemption.couponCode}-${mealType}`,
        commissionDeductedPaise: 0,
      });
    } catch (rewardEarningErr) {
      console.error(
        "[RewardRedemptionService] Reward meal earning hook error:",
        rewardEarningErr.message
      );
    }
  }

  // Check if all 3 meals are delivered
  const allDelivered = redemption.meals.every((m) => m.status === "delivered");
  if (allDelivered) {
    redemption.status = "completed";
    redemption.completedAt = new Date();

    const coupon = await RewardCoupon.findById(redemption.couponId);
    if (coupon) {
      coupon.status = "redeemed";
      coupon.redeemedAt = new Date();
      await coupon.save();
    }

    await createInAppNotification({
      recipientId: redemption.customerId,
      recipientRole: "customer",
      title: "Reward Feast Completed! 🏆",
      message: "All 3 meals of your reward feast have been delivered! We hope you loved GharKaSwad!",
      type: "redemption_update",
      metadata: { redemptionId: redemption._id },
    });
  }

  await redemption.save();
  return redemption;
};

/**
 * Cancel reward redemption and restore coupon to 'active'.
 */
export const cancelRewardRedemption = async ({
  redemptionId,
  userId,
  cancellationReason,
}) => {
  const redemption = await RewardRedemption.findById(redemptionId);
  if (!redemption) {
    const error = new Error("Reward redemption not found.");
    error.statusCode = 404;
    throw error;
  }

  if (redemption.status !== "in_progress") {
    const error = new Error(
      `Cannot cancel redemption with current status '${redemption.status}'.`
    );
    error.statusCode = 400;
    throw error;
  }

  redemption.status = "cancelled";
  redemption.cancelledAt = new Date();
  redemption.cancellationReason = cancellationReason || "Redemption cancelled";
  await redemption.save();

  // Restore coupon to active
  const coupon = await RewardCoupon.findById(redemption.couponId);
  if (coupon && coupon.status === "locked_in_redemption") {
    coupon.status = "active";
    coupon.redemptionId = undefined;
    await coupon.save();
  }

  return {
    success: true,
    message: "Reward redemption cancelled. Coupon restored to active status.",
    redemption,
  };
};

/**
 * Get customer reward redemptions.
 */
export const getCustomerRedemptions = async (customerId) => {
  return RewardRedemption.find({ customerId })
    .sort({ createdAt: -1 })
    .populate("chefId", "name email")
    .lean();
};
