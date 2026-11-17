import mongoose from "mongoose";
import Food from "../Models/Food.js";
import Order from "../Models/Order.js";
import ChefProfile from "../Models/ChefProfile.js";
import { logAdminAction } from "./auditLogService.js";

/**
 * Migration helper to ensure all pre-existing legacy food documents
 * without a moderationStatus are safely initialized to "approved".
 */
export async function migrateLegacyFoods() {
  try {
    const result = await Food.updateMany(
      { moderationStatus: { $exists: false } },
      { $set: { moderationStatus: "approved" } }
    );
    if (result.modifiedCount > 0) {
      console.log(`[FoodMigration] Successfully migrated ${result.modifiedCount} legacy food items to 'approved'.`);
    }
    return result;
  } catch (err) {
    console.error("[FoodMigration] Legacy food migration warning:", err.message);
    return null;
  }
}

/**
 * ADMIN: Lists all foods on the platform with search, filters, and pagination.
 */
export async function listAllFoods({
  search,
  chefId,
  categoryId,
  foodType,
  availability,
  moderationStatus,
  isActive,
  page = 1,
  limit = 20,
}) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = {};

  if (search && typeof search === "string" && search.trim().length > 0) {
    query.name = { $regex: search.trim(), $options: "i" };
  }

  if (chefId && mongoose.Types.ObjectId.isValid(chefId)) {
    const profile = await ChefProfile.findById(chefId);
    if (profile && profile.userId) {
      query.chefId = { $in: [new mongoose.Types.ObjectId(chefId), profile.userId] };
    } else {
      query.chefId = new mongoose.Types.ObjectId(chefId);
    }
  }

  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
    query.categoryId = categoryId;
  }

  if (foodType && ["veg", "non_veg"].includes(foodType)) {
    query.foodType = foodType;
  }

  if (availability && ["available", "unavailable"].includes(availability)) {
    query.availability = availability;
  }

  if (moderationStatus && ["pending", "approved", "flagged", "rejected"].includes(moderationStatus)) {
    query.moderationStatus = moderationStatus;
  }

  if (isActive !== undefined && isActive !== "") {
    query.isActive = isActive === "true" || isActive === true;
  }

  const [totalRecords, foods] = await Promise.all([
    Food.countDocuments(query),
    Food.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("chefId", "name email phone")
      .populate("categoryId", "name description")
      .populate("moderatedBy", "name email")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    foods,
  };
}

/**
 * ADMIN: View complete food item details including order popularity.
 */
export async function getFoodDetails(foodId) {
  const food = await Food.findById(foodId)
    .populate("chefId", "name email phone")
    .populate("categoryId", "name description")
    .populate("moderatedBy", "name email")
    .lean();

  if (!food) {
    const error = new Error("Food item not found.");
    error.statusCode = 404;
    throw error;
  }

  // Count how many orders have included this dish
  const orderCount = await Order.countDocuments({ "items.foodId": food._id });

  return {
    food,
    orderCount,
  };
}

/**
 * ADMIN: Moderate food listing (approve, flag, reject, or toggle isActive).
 */
export async function moderateFood(
  foodId,
  adminUserId,
  { moderationStatus, isActive, reason }
) {
  if (moderationStatus && !["pending", "approved", "flagged", "rejected"].includes(moderationStatus)) {
    const error = new Error(
      `Invalid moderationStatus '${moderationStatus}'. Allowed: pending, approved, flagged, rejected.`
    );
    error.statusCode = 400;
    throw error;
  }

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    const error = new Error("Moderation reason must be at least 3 characters long.");
    error.statusCode = 400;
    throw error;
  }

  const food = await Food.findById(foodId);
  if (!food) {
    const error = new Error("Food item not found.");
    error.statusCode = 404;
    throw error;
  }

  const previousState = {
    moderationStatus: food.moderationStatus,
    isActive: food.isActive,
    moderationReason: food.moderationReason,
    moderatedBy: food.moderatedBy,
  };

  if (moderationStatus) {
    food.moderationStatus = moderationStatus;
  }

  if (isActive !== undefined) {
    food.isActive = Boolean(isActive);
  }

  food.moderationReason = reason.trim();
  food.moderatedBy = adminUserId;
  food.moderatedAt = new Date();
  await food.save();

  const newState = {
    moderationStatus: food.moderationStatus,
    isActive: food.isActive,
    moderationReason: food.moderationReason,
    moderatedBy: food.moderatedBy,
  };

  // Record audit log
  await logAdminAction({
    adminId: adminUserId,
    actionType: "food_moderation",
    targetEntityType: "Food",
    targetEntityId: food._id,
    previousState,
    newState,
    reason: `Food '${food.name}' status updated to moderationStatus: ${food.moderationStatus}, isActive: ${food.isActive}. Reason: ${reason.trim()}`,
  });

  return food;
}
