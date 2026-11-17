import Food from "../Models/Food.js";
import Order from "../Models/Order.js";

/**
 * Inventory Management Service
 *
 * Handles atomic stock reservations, rollback on concurrent reservation failure,
 * and exactly-once stock restoration upon cancellation or rejection.
 */

/**
 * Atomically reserves food inventory for an array of ordered items.
 * If any item lacks sufficient availableQuantity, rolls back all previous deductions.
 *
 * @param {Array<{ foodId: ObjectId, quantity: number, foodName: string }>} items
 * @returns {Promise<void>}
 */
export const reserveStock = async (items) => {
  const deductedItems = [];

  try {
    for (const item of items) {
      const updated = await Food.findOneAndUpdate(
        {
          _id: item.foodId,
          availableQuantity: { $gte: item.quantity },
          isActive: true,
          availability: "available",
        },
        {
          $inc: { availableQuantity: -item.quantity },
        },
        { returnDocument: "after" }
      );

      if (!updated) {
        // Find current food details for clear error message
        const currentFood = await Food.findById(item.foodId);
        const available = currentFood ? currentFood.availableQuantity : 0;
        const name = currentFood ? currentFood.name : item.foodName || "Food item";

        const error = new Error(
          `Insufficient stock for '${name}'. Requested: ${item.quantity}, available: ${available}.`
        );
        error.statusCode = 400;
        throw error;
      }

      deductedItems.push({ foodId: item.foodId, quantity: item.quantity });
    }
  } catch (error) {
    // Rollback already deducted items
    for (const deducted of deductedItems) {
      await Food.updateOne(
        { _id: deducted.foodId },
        { $inc: { availableQuantity: deducted.quantity } }
      );
    }
    throw error;
  }
};

/**
 * Restores food inventory exactly once for a cancelled or rejected order.
 * Uses atomic conditional update on `stockRestored` to prevent double-restoration.
 *
 * @param {object} order - Mongoose Order document or plain object with _id and items
 * @returns {Promise<{ restored: boolean, message: string }>}
 */
export const restoreStock = async (order) => {
  if (!order || !order._id || !Array.isArray(order.items)) {
    return { restored: false, message: "Invalid order object provided." };
  }

  // Atomically claim the right to restore stock for this order
  const claim = await Order.findOneAndUpdate(
    { _id: order._id, stockRestored: false },
    { $set: { stockRestored: true } }
  );

  // If claim is null, stock was already restored by a prior request
  if (!claim) {
    return {
      restored: false,
      message: "Inventory stock has already been restored for this order.",
    };
  }

  // Increment back each food item's availableQuantity
  for (const item of order.items) {
    await Food.updateOne(
      { _id: item.foodId },
      { $inc: { availableQuantity: item.quantity } }
    );
  }

  return {
    restored: true,
    message: "Inventory stock restored successfully.",
  };
};
