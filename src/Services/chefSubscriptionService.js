import mongoose from "mongoose";
import Subscription from "../Models/Subscription.js";
import SubscriptionMealOrder from "../Models/SubscriptionMealOrder.js";
import Food from "../Models/Food.js";
import User from "../Models/User.js";
import { isReservationWindowOpen } from "../utils/dateUtils.js";
import {
  atomicRestoreSubscriptionStock,
  evaluateSubscriptionCompletion,
} from "./subscriptionMealService.js";
import { evaluateAndCreditDailyLoyaltyPoints } from "./loyaltyService.js";
import {
  evaluateAndReserveCommission,
  captureCommission,
  releaseCommissionReservation,
} from "./commissionService.js";
import {
  recordPendingChefEarning,
  confirmChefEarning,
  reversePendingChefEarning,
} from "./chefWalletService.js";
import ChefOrderSequence from "../Models/ChefOrderSequence.js";

/**
 * Chef: List assigned subscription meals
 * Only shows meals from active/paid subscriptions
 */
export const getChefSubscriptionMeals = async (chefId, query = {}) => {
  const filter = { chefId };

  if (query.date) filter.scheduledDateKey = query.date;
  if (query.status) filter.orderStatus = query.status;
  if (query.mealType) filter.mealType = query.mealType;

  // Find active subscriptions to filter out unpaid ones
  const activeSubscriptions = await Subscription.find({
    subscriptionStatus: { $in: ["active", "completed"] },
    paymentStatus: "paid",
  }).select("_id");

  const activeSubIds = activeSubscriptions.map((s) => s._id);
  filter.subscriptionId = { $in: activeSubIds };

  const meals = await SubscriptionMealOrder.find(filter)
    .sort({ scheduledDateKey: 1, mealType: 1 })
    .lean();

  // Populate customer name and minimal contact info
  const customerIds = [...new Set(meals.map((m) => m.customerId.toString()))];
  const customers = await User.find({ _id: { $in: customerIds } }).select("name phone").lean();
  const customerMap = customers.reduce((acc, c) => {
    acc[c._id.toString()] = c;
    return acc;
  }, {});

  const sanitizedMeals = meals.map((m) => {
    const cust = customerMap[m.customerId.toString()];
    return {
      ...m,
      customer: {
        name: cust ? cust.name : "Valued Customer",
        phone: m.deliveryType === "chef_delivery" && cust ? cust.phone : undefined,
      },
      // If customer_pickup, do not expose delivery address
      deliveryAddressSnapshot: m.deliveryType === "chef_delivery" ? m.deliveryAddressSnapshot : undefined,
    };
  });

  return {
    chefId,
    count: sanitizedMeals.length,
    meals: sanitizedMeals,
  };
};

/**
 * Chef: Get detailed assigned meal by ID
 */
export const getChefSubscriptionMealById = async (chefId, mealOrderId) => {
  const meal = await SubscriptionMealOrder.findOne({ _id: mealOrderId, chefId }).lean();
  if (!meal) {
    const error = new Error("Meal order not found or does not belong to your kitchen.");
    error.statusCode = 404;
    throw error;
  }

  // Check parent subscription is active
  const subscription = await Subscription.findById(meal.subscriptionId).lean();
  if (!subscription || subscription.paymentStatus !== "paid") {
    const error = new Error("This meal belongs to an unactivated or unpaid subscription.");
    error.statusCode = 403;
    throw error;
  }

  const customer = await User.findById(meal.customerId).select("name phone").lean();

  return {
    ...meal,
    customer: {
      name: customer ? customer.name : "Valued Customer",
      phone: meal.deliveryType === "chef_delivery" && customer ? customer.phone : undefined,
    },
    deliveryAddressSnapshot: meal.deliveryType === "chef_delivery" ? meal.deliveryAddressSnapshot : undefined,
  };
};

/**
 * Chef: Accept assigned subscription meal
 * Validates acceptance reservation window and atomically reserves inventory
 */
export const acceptSubscriptionMeal = async (chefId, mealOrderId) => {
  const meal = await SubscriptionMealOrder.findOne({ _id: mealOrderId, chefId });
  if (!meal) {
    const error = new Error("Meal order not found or does not belong to your kitchen.");
    error.statusCode = 404;
    throw error;
  }

  if (meal.orderStatus !== "scheduled") {
    const error = new Error(`Cannot accept meal in '${meal.orderStatus}' status. Expected 'scheduled'.`);
    error.statusCode = 400;
    throw error;
  }

  // 1. Verify reservation window has opened (8:00 PM IST of prior day)
  if (!isReservationWindowOpen(meal.scheduledDateKey)) {
    const error = new Error(
      `Cannot accept meal order early. The stock reservation window for ${meal.scheduledDateKey} opens at 8:00 PM IST on the day prior to service.`
    );
    error.statusCode = 400;
    throw error;
  }

  // 2. Atomically reserve stock from Food inventory
  const food = await Food.findOneAndUpdate(
    {
      _id: meal.foodItem.foodId,
      availableQuantity: { $gte: meal.foodItem.quantity },
      isActive: true,
      availability: "available",
    },
    {
      $inc: { availableQuantity: -meal.foodItem.quantity },
    },
    { new: true }
  );

  if (!food) {
    const error = new Error(
      `Insufficient food stock: Only limited portions are currently available for '${meal.foodItem.foodName}'. Please replenish inventory before accepting.`
    );
    error.statusCode = 409;
    throw error;
  }

  // Phase 9: Commission policy & minimum balance verification
  const grossAmountPaise = Math.round(meal.foodItem.itemTotal * 100);
  await evaluateAndReserveCommission({
    chefId,
    subscriptionMealOrderId: meal._id,
    basePaise: grossAmountPaise,
    orderNumber: meal.mealOrderNumber,
  });

  // Record pending chef earning
  await recordPendingChefEarning({
    chefId,
    sourceType: "subscription_meal",
    subscriptionMealOrderId: meal._id,
    subscriptionId: meal.subscriptionId,
    orderNumber: meal.mealOrderNumber,
    grossAmountPaise,
    foodDetails: [
      {
        foodId: meal.foodItem.foodId,
        foodName: meal.foodItem.foodName,
        quantity: meal.foodItem.quantity,
        unitPricePaise: Math.round(meal.foodItem.unitPrice * 100),
        itemTotalPaise: grossAmountPaise,
      },
    ],
    earningDateKey: meal.scheduledDateKey,
  });

  // 3. Mark meal accepted and stock reserved
  meal.orderStatus = "accepted";
  meal.isStockReserved = true;
  meal.stockRestored = false;
  meal.acceptedAt = new Date();
  await meal.save();

  return {
    meal,
    message: `Meal order accepted successfully. ${meal.foodItem.quantity} portion(s) reserved from inventory.`,
  };
};

/**
 * Chef: Reject assigned subscription meal
 * Restores reserved stock atomically if previously reserved
 */
export const rejectSubscriptionMeal = async (chefId, mealOrderId, reason) => {
  const meal = await SubscriptionMealOrder.findOne({ _id: mealOrderId, chefId });
  if (!meal) {
    const error = new Error("Meal order not found or does not belong to your kitchen.");
    error.statusCode = 404;
    throw error;
  }

  if (!["scheduled", "accepted"].includes(meal.orderStatus)) {
    const error = new Error(
      `Cannot reject meal in '${meal.orderStatus}' status. Meals can only be rejected before food preparation begins.`
    );
    error.statusCode = 400;
    throw error;
  }

  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    const error = new Error("A clear rejectionReason is required when rejecting a meal order.");
    error.statusCode = 400;
    throw error;
  }

  // Atomically restore stock if it was reserved
  if (meal.isStockReserved && !meal.stockRestored) {
    const restoreResult = await atomicRestoreSubscriptionStock(meal);
    if (restoreResult.restored) {
      meal.stockRestored = true;
    }
  }

  meal.orderStatus = "rejected";
  meal.rejectedAt = new Date();
  meal.rejectionReason = reason.trim();
  await meal.save();

  // Phase 9: Release commission reservation and reverse pending earning
  await releaseCommissionReservation({
    chefId,
    subscriptionMealOrderId: meal._id,
    orderNumber: meal.mealOrderNumber,
    reason: reason.trim(),
  });
  await reversePendingChefEarning({
    chefId,
    subscriptionMealOrderId: meal._id,
    reason: reason.trim(),
  });

  return {
    meal,
    message: "Meal order rejected. Customer has been alerted to choose an alternative dish.",
  };
};

/**
 * Chef: Update meal status through preparation and fulfillment lifecycle
 */
export const updateSubscriptionMealStatus = async (chefId, mealOrderId, targetStatus) => {
  const meal = await SubscriptionMealOrder.findOne({ _id: mealOrderId, chefId });
  if (!meal) {
    const error = new Error("Meal order not found or does not belong to your kitchen.");
    error.statusCode = 404;
    throw error;
  }

  const current = meal.orderStatus;
  const isPickup = meal.deliveryType === "customer_pickup";

  // Validate strict transition flow
  let isValid = false;
  if (current === "accepted" && targetStatus === "preparing") {
    isValid = true;
    meal.preparingAt = new Date();
  } else if (current === "preparing") {
    if (isPickup && targetStatus === "ready_for_pickup") {
      isValid = true;
      meal.readyForPickupAt = new Date();
    } else if (!isPickup && targetStatus === "out_for_delivery") {
      isValid = true;
      meal.outForDeliveryAt = new Date();
    }
  } else if ((current === "ready_for_pickup" || current === "out_for_delivery") && targetStatus === "delivered") {
    isValid = true;
    meal.deliveredAt = new Date();
  }

  if (!isValid) {
    const error = new Error(
      `Invalid order status transition from '${current}' to '${targetStatus}' for delivery type '${meal.deliveryType}'.`
    );
    error.statusCode = 400;
    throw error;
  }

  meal.orderStatus = targetStatus;
  await meal.save();

  // If marked delivered, evaluate whether the parent subscription has completed
  if (targetStatus === "delivered") {
    await evaluateSubscriptionCompletion(meal.subscriptionId);

    // Trigger daily loyalty points evaluation for this customer and date
    try {
      await evaluateAndCreditDailyLoyaltyPoints({
        customerId: meal.customerId,
        scheduledDateKey: meal.scheduledDateKey,
      });
    } catch (loyaltyErr) {
      console.error(
        "[ChefSubscriptionService] Loyalty points evaluation hook error:",
        loyaltyErr.message
      );
    }

    // Phase 9: Capture commission and confirm chef earning
    try {
      const seq = await ChefOrderSequence.findOne({ chefId });
      const isFirstOrder =
        seq &&
        seq.firstOrderId &&
        seq.firstOrderId.toString() === meal._id.toString();

      const grossAmountPaise = Math.round(meal.foodItem.itemTotal * 100);

      const commissionResult = await captureCommission({
        chefId,
        subscriptionMealOrderId: meal._id,
        finalBasePaise: grossAmountPaise,
        isFirstOrder: Boolean(isFirstOrder),
        orderNumber: meal.mealOrderNumber,
      });

      await confirmChefEarning({
        chefId,
        subscriptionMealOrderId: meal._id,
        commissionDeductedPaise: commissionResult?.capturedPaise || 0,
      });
    } catch (earningErr) {
      console.error(
        "[ChefSubscriptionService] Chef earning / commission capture hook error:",
        earningErr.message
      );
    }
  }

  return {
    meal,
    message: `Meal order status updated to '${targetStatus}'.`,
  };
};
