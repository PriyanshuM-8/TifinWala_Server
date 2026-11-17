import mongoose from "mongoose";
import Subscription from "../Models/Subscription.js";
import SubscriptionMealOrder from "../Models/SubscriptionMealOrder.js";
import User from "../Models/User.js";
import ChefProfile from "../Models/ChefProfile.js";
import Food from "../Models/Food.js";
import Category from "../Models/Category.js";
import CustomerAddress from "../Models/CustomerAddress.js";
import {
  getKolkataDateKey,
  parseDateKeyToKolkataDate,
  calculateInclusiveEndDateKey,
} from "../utils/dateUtils.js";
import {
  generateSubscriptionMeals,
  atomicRestoreSubscriptionStock,
} from "./subscriptionMealService.js";

/**
 * Generates unique human-readable subscription number
 * Format: GKS-SUB-YYYYMMDD-XXXX
 */
const generateSubscriptionNumber = (dateKey) => {
  const cleanDateStr = (dateKey || getKolkataDateKey()).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `GKS-SUB-${cleanDateStr}-${randomSuffix}`;
};

/**
 * CUSTOMER: Create a custom flexible-duration subscription
 */
export const createSubscription = async (customerId, subscriptionData) => {
  const {
    startDateKey: reqStartDateKey,
    durationDays,
    mealTypes,
    mealConfigurations,
    notes,
  } = subscriptionData;

  // 1. Verify customer
  const customer = await User.findOne({ _id: customerId, role: "customer", isActive: true });
  if (!customer) {
    const error = new Error("Authenticated customer account is invalid or inactive.");
    error.statusCode = 403;
    throw error;
  }

  // 2. Validate duration
  const parsedDuration = parseInt(durationDays, 10);
  if (isNaN(parsedDuration) || parsedDuration <= 0) {
    const error = new Error("Subscription duration must be a positive integer of at least 1 day.");
    error.statusCode = 400;
    throw error;
  }

  // 3. Validate startDateKey (defaults to current date in Asia/Kolkata)
  let startDateKey = reqStartDateKey;
  if (!startDateKey) {
    startDateKey = getKolkataDateKey();
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateKey)) {
    const error = new Error("Start date must be in YYYY-MM-DD format.");
    error.statusCode = 400;
    throw error;
  }

  // Calculate inclusive end date key
  const endDateKey = calculateInclusiveEndDateKey(startDateKey, parsedDuration);
  const startDate = parseDateKeyToKolkataDate(startDateKey);
  const endDate = parseDateKeyToKolkataDate(endDateKey);

  // 4. Validate meal types
  const validMealTypes = ["breakfast", "lunch", "dinner"];
  if (!Array.isArray(mealTypes) || mealTypes.length === 0 || mealTypes.length > 3) {
    const error = new Error("You must select between 1 and 3 meal types (breakfast, lunch, dinner).");
    error.statusCode = 400;
    throw error;
  }
  for (const m of mealTypes) {
    if (!validMealTypes.includes(m)) {
      const error = new Error(`Invalid meal type '${m}'. Allowed values: breakfast, lunch, dinner.`);
      error.statusCode = 400;
      throw error;
    }
  }

  // 5. Validate mealConfigurations
  if (!Array.isArray(mealConfigurations) || mealConfigurations.length === 0) {
    const error = new Error("Meal configurations array is required.");
    error.statusCode = 400;
    throw error;
  }

  const configuredMealTypes = new Set();
  const validatedConfigs = [];
  const addressMap = {};
  let dailySubtotal = 0;

  for (const config of mealConfigurations) {
    const { mealType, chefId, foodId, quantity, deliveryType, deliveryAddressId } = config;

    if (!validMealTypes.includes(mealType)) {
      const error = new Error(`Invalid mealType '${mealType}' in mealConfigurations.`);
      error.statusCode = 400;
      throw error;
    }

    if (!mealTypes.includes(mealType)) {
      const error = new Error(`Meal configuration for '${mealType}' was provided, but '${mealType}' is not in selected mealTypes.`);
      error.statusCode = 400;
      throw error;
    }

    if (configuredMealTypes.has(mealType)) {
      const error = new Error(`Duplicate configuration for '${mealType}'. Each mealType can only be configured once per subscription.`);
      error.statusCode = 400;
      throw error;
    }
    configuredMealTypes.add(mealType);

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      const error = new Error(`Quantity for '${mealType}' must be a positive integer.`);
      error.statusCode = 400;
      throw error;
    }

    if (!["chef_delivery", "customer_pickup"].includes(deliveryType)) {
      const error = new Error(`Invalid deliveryType '${deliveryType}' for '${mealType}'. Allowed: chef_delivery, customer_pickup.`);
      error.statusCode = 400;
      throw error;
    }

    // Validate Chef
    const chefUser = await User.findOne({ _id: chefId, role: "chef", isActive: true });
    if (!chefUser) {
      const error = new Error(`Selected chef for '${mealType}' does not exist or is inactive.`);
      error.statusCode = 400;
      throw error;
    }

    const chefProfile = await ChefProfile.findOne({
      $or: [{ userId: chefUser._id }, { chefId: chefUser._id }],
      approvalStatus: "approved",
    });
    if (!chefProfile) {
      const error = new Error(`Selected chef for '${mealType}' is pending approval or not approved.`);
      error.statusCode = 400;
      throw error;
    }

    // Validate Food
    const food = await Food.findOne({
      _id: foodId,
      chefId: chefUser._id,
      isActive: true,
      availability: "available",
    });
    if (!food) {
      const error = new Error(`Food item for '${mealType}' is inactive, unavailable, or does not belong to the selected chef.`);
      error.statusCode = 400;
      throw error;
    }

    // Validate Food Category
    const categoryId = food.categoryId || food.category;
    const category = await Category.findOne({ _id: categoryId, isActive: true });
    if (!category) {
      const error = new Error(`The food item for '${mealType}' belongs to an inactive or non-existent category.`);
      error.statusCode = 400;
      throw error;
    }

    // Validate Address if chef_delivery
    if (deliveryType === "chef_delivery") {
      if (!deliveryAddressId) {
        const error = new Error(`deliveryAddressId is required for '${mealType}' with 'chef_delivery'.`);
        error.statusCode = 400;
        throw error;
      }
      const address = await CustomerAddress.findOne({
        _id: deliveryAddressId,
        $or: [{ userId: customerId }, { customerId }],
      });
      if (!address) {
        const error = new Error(`Delivery address for '${mealType}' not found or does not belong to your account.`);
        error.statusCode = 400;
        throw error;
      }
      addressMap[deliveryAddressId.toString()] = address;
    }

    // Authoritative pricing from DB
    const unitPrice = food.price;
    const mealDailyTotal = unitPrice * parsedQty;
    dailySubtotal += mealDailyTotal;

    validatedConfigs.push({
      mealType,
      chefId: chefUser._id,
      foodId: food._id,
      quantity: parsedQty,
      deliveryType,
      deliveryAddressId: deliveryType === "chef_delivery" ? deliveryAddressId : null,
      unitPrice,
      mealDailyTotal,
    });
  }

  // Ensure all declared mealTypes have a corresponding configuration
  for (const mt of mealTypes) {
    if (!configuredMealTypes.has(mt)) {
      const error = new Error(`Missing configuration for declared mealType '${mt}'.`);
      error.statusCode = 400;
      throw error;
    }
  }

  const totalAmount = dailySubtotal * parsedDuration;
  const subscriptionNumber = generateSubscriptionNumber(startDateKey);

  // 6. Create subscription and generate child meal orders
  const subscription = new Subscription({
    subscriptionNumber,
    customerId,
    startDateKey,
    endDateKey,
    startDate,
    endDate,
    durationDays: parsedDuration,
    timezone: "Asia/Kolkata",
    mealTypes,
    mealConfigurations: validatedConfigs,
    dailySubtotal,
    totalAmount,
    subscriptionStatus: "pending_payment",
    paymentStatus: "pending",
    notes: notes ? String(notes).trim().slice(0, 500) : "",
  });

  await subscription.save();

  // Generate child daily meal orders
  const generatedMeals = await generateSubscriptionMeals(subscription, addressMap);

  return {
    subscription,
    generatedMealsCount: generatedMeals.length,
    message: "Subscription created successfully. Please complete payment activation to begin service.",
  };
};

/**
 * INTERNAL SERVICE ONLY:
 * Activate subscription after verified payment in future payment gateway phase (Phase 10).
 * NOT exposed through public customer API endpoints.
 * Customers are never allowed to simulate or trigger payment activation themselves.
 */
export const activateSubscriptionInternal = async (customerId, subscriptionId, paymentData = {}) => {
  const subscription = await Subscription.findOne({ _id: subscriptionId, customerId });
  if (!subscription) {
    const error = new Error("Subscription not found or does not belong to your account.");
    error.statusCode = 404;
    throw error;
  }

  if (subscription.subscriptionStatus === "active" || subscription.paymentStatus === "paid") {
    const error = new Error("Subscription is already active and paid.");
    error.statusCode = 400;
    throw error;
  }

  if (subscription.subscriptionStatus === "cancelled") {
    const error = new Error("Cancelled subscription cannot be activated.");
    error.statusCode = 400;
    throw error;
  }

  subscription.subscriptionStatus = "active";
  subscription.paymentStatus = "paid";
  subscription.activatedAt = new Date();
  await subscription.save();

  return {
    subscription,
    message: "Subscription payment confirmed and service is now active.",
  };
};

export const activateSubscriptionPayment = activateSubscriptionInternal;

/**
 * CUSTOMER: List subscriptions with filtering and pagination
 */
export const getCustomerSubscriptions = async (customerId, query = {}) => {
  const page = parseInt(query.page, 10) || 1;
  const limit = Math.min(parseInt(query.limit, 10) || 10, 50);
  const skip = (page - 1) * limit;

  const filter = { customerId };
  if (query.status) {
    filter.subscriptionStatus = query.status;
  }

  const [totalRecords, subscriptions] = await Promise.all([
    Subscription.countDocuments(filter),
    Subscription.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    success: true,
    pagination: {
      totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit) || 1,
    },
    subscriptions,
  };
};

/**
 * CUSTOMER: Get single subscription detail with aggregated progress metrics
 */
export const getCustomerSubscriptionById = async (customerId, subscriptionId) => {
  const subscription = await Subscription.findOne({ _id: subscriptionId, customerId }).lean();
  if (!subscription) {
    const error = new Error("Subscription not found or does not belong to your account.");
    error.statusCode = 404;
    throw error;
  }

  // Aggregate meal status counts
  const mealStats = await SubscriptionMealOrder.aggregate([
    { $match: { subscriptionId: subscription._id } },
    { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
  ]);

  const statusSummary = {
    totalMeals: 0,
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
  };

  mealStats.forEach((s) => {
    if (statusSummary[s._id] !== undefined) {
      statusSummary[s._id] = s.count;
    }
    statusSummary.totalMeals += s.count;
  });

  return {
    ...subscription,
    mealSummary: statusSummary,
  };
};

/**
 * CUSTOMER: Cancel active subscription
 */
export const cancelCustomerSubscription = async (customerId, subscriptionId, reason = "Customer cancelled subscription") => {
  const subscription = await Subscription.findOne({ _id: subscriptionId, customerId });
  if (!subscription) {
    const error = new Error("Subscription not found or does not belong to your account.");
    error.statusCode = 404;
    throw error;
  }

  if (subscription.subscriptionStatus === "cancelled") {
    const error = new Error("Subscription is already cancelled.");
    error.statusCode = 400;
    throw error;
  }

  if (subscription.subscriptionStatus === "completed") {
    const error = new Error("Completed subscription cannot be cancelled.");
    error.statusCode = 400;
    throw error;
  }

  // Find all remaining non-terminal meals that can be cancelled
  const eligibleMeals = await SubscriptionMealOrder.find({
    subscriptionId: subscription._id,
    orderStatus: { $in: ["scheduled", "accepted"] },
  });

  let cancelledMealsCount = 0;
  for (const meal of eligibleMeals) {
    // If stock was reserved for this meal, restore it atomically
    if (meal.isStockReserved && !meal.stockRestored) {
      const restoreResult = await atomicRestoreSubscriptionStock(meal);
      if (restoreResult.restored) {
        meal.stockRestored = true;
      }
    }
    meal.orderStatus = "cancelled";
    await meal.save();
    cancelledMealsCount++;
  }

  subscription.subscriptionStatus = "cancelled";
  subscription.cancelledAt = new Date();
  subscription.cancellationReason = reason && typeof reason === "string" ? reason.trim() : "Customer cancelled subscription";
  await subscription.save();

  return {
    subscription,
    cancelledMealsCount,
    message: `Subscription cancelled successfully. ${cancelledMealsCount} future scheduled meal(s) cancelled.`,
  };
};
