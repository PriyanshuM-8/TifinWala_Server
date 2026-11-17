import mongoose from "mongoose";
import Subscription from "../Models/Subscription.js";
import SubscriptionMealOrder from "../Models/SubscriptionMealOrder.js";
import Food from "../Models/Food.js";
import ChefProfile from "../Models/ChefProfile.js";
import CustomerAddress from "../Models/CustomerAddress.js";
import User from "../Models/User.js";
import {
  isSkipCutoffElapsed,
  getReservationWindowOpensAt,
  parseDateKeyToKolkataDate,
  generateDateKeysRange,
  getKolkataDateKey,
} from "../utils/dateUtils.js";

/**
 * Concurrency-safe atomic stock restoration
 * Claims restoration right atomically on the meal order before restoring food inventory
 */
export const atomicRestoreSubscriptionStock = async (mealOrder, session = null) => {
  if (!mealOrder.isStockReserved || mealOrder.stockRestored) {
    return { restored: false, reason: "Stock was not reserved or has already been restored." };
  }

  // Atomically claim restoration right
  const claimedMeal = await SubscriptionMealOrder.findOneAndUpdate(
    {
      _id: mealOrder._id,
      isStockReserved: true,
      stockRestored: false,
      orderStatus: { $nin: ["delivered"] },
    },
    {
      $set: { stockRestored: true },
    },
    { new: true, session }
  );

  if (!claimedMeal) {
    return { restored: false, reason: "Stock was not reserved, already restored, or meal is delivered." };
  }

  // Safely restore stock to Food inventory
  await Food.updateOne(
    { _id: claimedMeal.foodItem.foodId },
    { $inc: { availableQuantity: claimedMeal.foodItem.quantity } },
    { session }
  );

  return { restored: true, quantityRestored: claimedMeal.foodItem.quantity };
};

/**
 * Evaluates whether all scheduled meals of a subscription have reached terminal states
 * If zero non-terminal meals remain, transitions subscription to "completed"
 */
export const evaluateSubscriptionCompletion = async (subscriptionId, session = null) => {
  const nonTerminalCount = await SubscriptionMealOrder.countDocuments({
    subscriptionId,
    orderStatus: {
      $in: ["scheduled", "accepted", "preparing", "ready_for_pickup", "out_for_delivery"],
    },
  }).session(session);

  if (nonTerminalCount === 0) {
    const updated = await Subscription.findOneAndUpdate(
      {
        _id: subscriptionId,
        subscriptionStatus: "active",
      },
      {
        $set: {
          subscriptionStatus: "completed",
          completedAt: new Date(),
        },
      },
      { new: true, session }
    );
    return { completed: true, subscription: updated };
  }

  return { completed: false, remainingMeals: nonTerminalCount };
};

/**
 * Generates all child daily SubscriptionMealOrder documents for a subscription contract
 */
export const generateSubscriptionMeals = async (subscription, addressMap = {}, session = null) => {
  const dateKeys = generateDateKeysRange(subscription.startDateKey, subscription.durationDays);
  const mealOrdersToInsert = [];

  for (const dateKey of dateKeys) {
    const scheduledDate = parseDateKeyToKolkataDate(dateKey);
    const reservationWindowOpensAt = getReservationWindowOpensAt(dateKey);

    for (const config of subscription.mealConfigurations) {
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const cleanDateStr = dateKey.replace(/-/g, "");
      const mealOrderNumber = `GKS-SM-${cleanDateStr}-${randomSuffix}`;

      // Build delivery snapshot if chef_delivery
      let deliveryAddressSnapshot = null;
      if (config.deliveryType === "chef_delivery" && config.deliveryAddressId) {
        const addr = addressMap[config.deliveryAddressId.toString()];
        if (addr) {
          deliveryAddressSnapshot = {
            fullName: addr.fullName,
            phone: addr.phone,
            addressType: addr.addressType || "home",
            addressLine: addr.addressLine,
            landmark: addr.landmark || "",
            city: addr.city,
            state: addr.state,
            pincode: addr.pincode,
            location: addr.location,
          };
        }
      }

      // Fetch food details for snapshot
      const food = await Food.findById(config.foodId).session(session);
      const foodItemSnapshot = {
        foodId: config.foodId,
        foodName: food ? food.name : "Homemade Dish",
        foodImage: food && Array.isArray(food.images) && food.images.length > 0 ? food.images[0] : "",
        foodType: food ? food.foodType : "veg",
        quantity: config.quantity,
        unitPrice: config.unitPrice,
        itemTotal: config.mealDailyTotal,
      };

      // Initial public kitchen branding
      const chefProfile = await ChefProfile.findOne({
        $or: [{ userId: config.chefId }, { chefId: config.chefId }],
      }).session(session);
      const pickupInformationSnapshot = {
        kitchenName: chefProfile ? chefProfile.kitchenName : "Home Kitchen",
        city: chefProfile ? chefProfile.city : "",
      };

      mealOrdersToInsert.push({
        mealOrderNumber,
        subscriptionId: subscription._id,
        customerId: subscription.customerId,
        chefId: config.chefId,
        scheduledDateKey: dateKey,
        scheduledDate,
        timezone: subscription.timezone || "Asia/Kolkata",
        mealType: config.mealType,
        foodItem: foodItemSnapshot,
        deliveryType: config.deliveryType,
        deliveryAddressSnapshot,
        pickupInformationSnapshot,
        orderStatus: "scheduled",
        isSkipped: false,
        isStockReserved: false,
        stockRestored: false,
        reservationWindowOpensAt,
        rejectionHistory: [],
        reassignmentHistory: [],
      });
    }
  }

  // Insert all child orders in bulk
  return await SubscriptionMealOrder.insertMany(mealOrdersToInsert, { session });
};

/**
 * Retrieves scheduled meals for a customer subscription with pickup privacy enforcement
 */
export const getCustomerSubscriptionMeals = async (customerId, subscriptionId, query = {}) => {
  const subscription = await Subscription.findOne({ _id: subscriptionId, customerId });
  if (!subscription) {
    const error = new Error("Subscription not found or does not belong to your account.");
    error.statusCode = 404;
    throw error;
  }

  const filter = { subscriptionId };
  if (query.date) filter.scheduledDateKey = query.date;
  if (query.mealType) filter.mealType = query.mealType;
  if (query.status) filter.orderStatus = query.status;

  const meals = await SubscriptionMealOrder.find(filter)
    .sort({ scheduledDateKey: 1, mealType: 1 })
    .lean();

  // Enforce Customer Pickup Privacy dynamically
  for (const meal of meals) {
    if (meal.deliveryType === "customer_pickup") {
      if (meal.orderStatus === "ready_for_pickup") {
        // Disclose private kitchen details only when ready for pickup
        const chefProfile = await ChefProfile.findOne({
          $or: [{ userId: meal.chefId }, { chefId: meal.chefId }],
        }).lean();
        const chefUser = await User.findById(meal.chefId).lean();
        meal.pickupInformation = {
          kitchenName: chefProfile ? chefProfile.kitchenName : "Home Kitchen",
          city: chefProfile ? chefProfile.city : "",
          kitchenAddress: chefProfile ? chefProfile.kitchenAddress : "",
          pickupInstructions: chefProfile ? chefProfile.pickupInstructions || "Please arrive during standard meal delivery window." : "",
          chefPhone: chefUser ? chefUser.phone : "",
        };
      } else {
        // Masked pre-pickup view
        meal.pickupInformation = {
          kitchenName: meal.pickupInformationSnapshot ? meal.pickupInformationSnapshot.kitchenName : "Home Kitchen",
          city: meal.pickupInformationSnapshot ? meal.pickupInformationSnapshot.city : "",
          message: "Full kitchen address & pickup instructions will be revealed once the chef marks the dish 'ready_for_pickup'.",
        };
      }
    }
  }

  return {
    subscriptionId: subscription._id,
    subscriptionNumber: subscription.subscriptionNumber,
    count: meals.length,
    meals,
  };
};

/**
 * Retrieves a single customer meal order with pickup privacy enforcement
 */
export const getCustomerMealOrderById = async (customerId, mealOrderId) => {
  const meal = await SubscriptionMealOrder.findOne({ _id: mealOrderId, customerId }).lean();
  if (!meal) {
    const error = new Error("Meal order not found or does not belong to your account.");
    error.statusCode = 404;
    throw error;
  }

  if (meal.deliveryType === "customer_pickup") {
    if (meal.orderStatus === "ready_for_pickup") {
      const chefProfile = await ChefProfile.findOne({
        $or: [{ userId: meal.chefId }, { chefId: meal.chefId }],
      }).lean();
      const chefUser = await User.findById(meal.chefId).lean();
      meal.pickupInformation = {
        kitchenName: chefProfile ? chefProfile.kitchenName : "Home Kitchen",
        city: chefProfile ? chefProfile.city : "",
        kitchenAddress: chefProfile ? chefProfile.kitchenAddress : "",
        pickupInstructions: chefProfile ? chefProfile.pickupInstructions || "Please arrive during standard meal delivery window." : "",
        chefPhone: chefUser ? chefUser.phone : "",
      };
    } else {
      meal.pickupInformation = {
        kitchenName: meal.pickupInformationSnapshot ? meal.pickupInformationSnapshot.kitchenName : "Home Kitchen",
        city: meal.pickupInformationSnapshot ? meal.pickupInformationSnapshot.city : "",
        message: "Full kitchen address & pickup instructions will be revealed once the chef marks the dish 'ready_for_pickup'.",
      };
    }
  }

  return meal;
};

/**
 * Customer skips a specific scheduled meal before the 8:00 PM IST cutoff
 */
export const skipCustomerMeal = async (customerId, mealOrderId, reason = "Customer skipped") => {
  const meal = await SubscriptionMealOrder.findOne({ _id: mealOrderId, customerId });
  if (!meal) {
    const error = new Error("Meal order not found or does not belong to your account.");
    error.statusCode = 404;
    throw error;
  }

  if (meal.isSkipped || meal.orderStatus === "skipped") {
    const error = new Error("This meal has already been skipped.");
    error.statusCode = 400;
    throw error;
  }

  // Allowed skip states: scheduled or accepted (before cooking starts)
  const allowedStatuses = ["scheduled", "accepted"];
  if (!allowedStatuses.includes(meal.orderStatus)) {
    const error = new Error(
      `Cannot skip meal in '${meal.orderStatus}' status. Only scheduled or accepted meals prior to food preparation can be skipped.`
    );
    error.statusCode = 400;
    throw error;
  }

  // Validate cutoff time: >= 8:00 PM IST on day prior
  if (isSkipCutoffElapsed(meal.scheduledDateKey)) {
    const error = new Error(
      `Cutoff time elapsed: Meal for ${meal.scheduledDateKey} cannot be skipped after 8:00 PM IST on the previous day.`
    );
    error.statusCode = 400;
    throw error;
  }

  // If stock was already reserved, restore it atomically
  if (meal.isStockReserved && !meal.stockRestored) {
    const restoreResult = await atomicRestoreSubscriptionStock(meal);
    if (restoreResult.restored) {
      meal.stockRestored = true;
    }
  }

  meal.orderStatus = "skipped";
  meal.isSkipped = true;
  meal.skippedAt = new Date();
  meal.skipReason = reason && typeof reason === "string" ? reason.trim() : "Customer skipped";
  await meal.save();

  // Evaluate if subscription has reached full completion
  await evaluateSubscriptionCompletion(meal.subscriptionId);

  return meal;
};

/**
 * Customer skips all scheduled meals for an entire calendar day
 */
export const skipCustomerDay = async (customerId, subscriptionId, dateKey, reason = "Customer skipped day") => {
  const subscription = await Subscription.findOne({ _id: subscriptionId, customerId });
  if (!subscription) {
    const error = new Error("Subscription not found or does not belong to your account.");
    error.statusCode = 404;
    throw error;
  }

  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    const error = new Error("Valid dateKey in YYYY-MM-DD format is required.");
    error.statusCode = 400;
    throw error;
  }

  if (isSkipCutoffElapsed(dateKey)) {
    const error = new Error(
      `Cutoff time elapsed: Meals for ${dateKey} cannot be skipped after 8:00 PM IST on the previous day.`
    );
    error.statusCode = 400;
    throw error;
  }

  const eligibleMeals = await SubscriptionMealOrder.find({
    subscriptionId,
    customerId,
    scheduledDateKey: dateKey,
    orderStatus: { $in: ["scheduled", "accepted"] },
  });

  if (eligibleMeals.length === 0) {
    const error = new Error(`No eligible scheduled or accepted meals found to skip on ${dateKey}.`);
    error.statusCode = 400;
    throw error;
  }

  let skippedCount = 0;
  for (const meal of eligibleMeals) {
    if (meal.isStockReserved && !meal.stockRestored) {
      const restoreResult = await atomicRestoreSubscriptionStock(meal);
      if (restoreResult.restored) {
        meal.stockRestored = true;
      }
    }
    meal.orderStatus = "skipped";
    meal.isSkipped = true;
    meal.skippedAt = new Date();
    meal.skipReason = reason && typeof reason === "string" ? reason.trim() : "Customer skipped day";
    await meal.save();
    skippedCount++;
  }

  await evaluateSubscriptionCompletion(subscriptionId);

  return {
    subscriptionId,
    dateKey,
    skippedCount,
    message: `Successfully skipped ${skippedCount} meal(s) for ${dateKey}.`,
  };
};

/**
 * Customer replaces a rejected meal with an alternative food item and chef
 */
export const replaceRejectedMeal = async (customerId, mealOrderId, replacementData) => {
  const { chefId, foodId, deliveryType, deliveryAddressId } = replacementData;

  const meal = await SubscriptionMealOrder.findOne({ _id: mealOrderId, customerId });
  if (!meal) {
    const error = new Error("Meal order not found or does not belong to your account.");
    error.statusCode = 404;
    throw error;
  }

  if (meal.orderStatus !== "rejected") {
    const error = new Error(`Only rejected meals can be replaced. Current status is '${meal.orderStatus}'.`);
    error.statusCode = 400;
    throw error;
  }

  // 1. Validate new chef
  const newChef = await User.findOne({ _id: chefId, role: "chef", isActive: true });
  if (!newChef) {
    const error = new Error("Selected replacement chef is not active or does not exist.");
    error.statusCode = 400;
    throw error;
  }

  const chefProfile = await ChefProfile.findOne({
    $or: [{ userId: newChef._id }, { chefId: newChef._id }],
    approvalStatus: "approved",
  });
  if (!chefProfile) {
    const error = new Error("Selected replacement chef is not approved by administrator.");
    error.statusCode = 400;
    throw error;
  }

  // 2. Validate new food item
  const newFood = await Food.findOne({
    _id: foodId,
    chefId: newChef._id,
    isActive: true,
    availability: "available",
  });
  if (!newFood) {
    const error = new Error("Selected replacement dish is not available or does not belong to the selected chef.");
    error.statusCode = 400;
    throw error;
  }

  // Price match policy for Phase 7
  if (newFood.price !== meal.foodItem.unitPrice) {
    const error = new Error(
      `Replacement dish price (₹${newFood.price}) must match the original dish price (₹${meal.foodItem.unitPrice}). Price differentials will be supported in Phase 10.`
    );
    error.statusCode = 400;
    throw error;
  }

  // 3. Validate delivery configuration
  let newDeliverySnapshot = null;
  const effectiveDeliveryType = deliveryType || meal.deliveryType;

  if (effectiveDeliveryType === "chef_delivery") {
    const targetAddressId = deliveryAddressId || (meal.deliveryAddressSnapshot ? meal.deliveryAddressSnapshot._id : null);
    if (!targetAddressId) {
      const error = new Error("Valid deliveryAddressId is required for chef delivery replacement.");
      error.statusCode = 400;
      throw error;
    }
    const addr = await CustomerAddress.findOne({
      _id: targetAddressId,
      $or: [{ userId: customerId }, { customerId }],
    });
    if (!addr) {
      const error = new Error("Delivery address not found or does not belong to your account.");
      error.statusCode = 400;
      throw error;
    }
    newDeliverySnapshot = {
      fullName: addr.fullName,
      phone: addr.phone,
      addressType: addr.addressType || "home",
      addressLine: addr.addressLine,
      landmark: addr.landmark || "",
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      location: addr.location,
    };
  }

  // 4. Archive old rejection details to rejectionHistory
  const oldRejectionRecord = {
    chefId: meal.chefId,
    foodId: meal.foodItem.foodId,
    foodName: meal.foodItem.foodName,
    rejectionReason: meal.rejectionReason || "Chef rejected meal",
    rejectedAt: meal.rejectedAt || new Date(),
    stockRestored: meal.stockRestored,
  };
  meal.rejectionHistory.push(oldRejectionRecord);

  // 5. Append reassignment delta to reassignmentHistory
  const reassignmentRecord = {
    previousChefId: meal.chefId,
    previousFoodId: meal.foodItem.foodId,
    newChefId: newChef._id,
    newFoodId: newFood._id,
    changedAt: new Date(),
    changeReason: "Customer replaced rejected meal.",
  };
  meal.reassignmentHistory.push(reassignmentRecord);

  // 6. Update current active assignment
  meal.chefId = newChef._id;
  meal.foodItem = {
    foodId: newFood._id,
    foodName: newFood.name,
    foodImage: Array.isArray(newFood.images) && newFood.images.length > 0 ? newFood.images[0] : "",
    foodType: newFood.foodType,
    quantity: meal.foodItem.quantity,
    unitPrice: newFood.price,
    itemTotal: newFood.price * meal.foodItem.quantity,
  };
  meal.deliveryType = effectiveDeliveryType;
  meal.deliveryAddressSnapshot = newDeliverySnapshot;
  meal.pickupInformationSnapshot = {
    kitchenName: chefProfile.kitchenName,
    city: chefProfile.city,
  };

  // Reset lifecycle state for the fresh assignment
  meal.orderStatus = "scheduled";
  meal.isStockReserved = false;
  meal.stockRestored = false;
  meal.acceptedAt = null;
  meal.preparingAt = null;
  meal.readyForPickupAt = null;
  meal.outForDeliveryAt = null;
  meal.deliveredAt = null;
  meal.rejectedAt = null;
  meal.rejectionReason = null;

  await meal.save();

  return meal;
};

/**
 * Returns complete customer meal history across all terminal and non-active states
 */
export const getCustomerMealHistory = async (customerId, subscriptionId, query = {}) => {
  const subscription = await Subscription.findOne({ _id: subscriptionId, customerId });
  if (!subscription) {
    const error = new Error("Subscription not found or does not belong to your account.");
    error.statusCode = 404;
    throw error;
  }

  const page = parseInt(query.page, 10) || 1;
  const limit = Math.min(parseInt(query.limit, 10) || 10, 50);
  const skip = (page - 1) * limit;

  // Non-active historical states
  const historyStatuses = ["delivered", "skipped", "cancelled", "rejected", "expired"];

  const filter = {
    subscriptionId,
    orderStatus: query.status ? query.status : { $in: historyStatuses },
  };

  if (query.mealType) filter.mealType = query.mealType;
  if (query.date) filter.scheduledDateKey = query.date;
  if (query.startDateKey && query.endDateKey) {
    filter.scheduledDateKey = { $gte: query.startDateKey, $lte: query.endDateKey };
  }

  const [totalRecords, records] = await Promise.all([
    SubscriptionMealOrder.countDocuments(filter),
    SubscriptionMealOrder.find(filter)
      .sort({ scheduledDateKey: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    success: true,
    subscriptionId: subscription._id,
    subscriptionNumber: subscription.subscriptionNumber,
    pagination: {
      totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit) || 1,
    },
    history: records,
  };
};
