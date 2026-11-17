import mongoose from "mongoose";
import Cart from "../Models/Cart.js";
import Food from "../Models/Food.js";
import Category from "../Models/Category.js";
import ChefProfile from "../Models/ChefProfile.js";
import User from "../Models/User.js";

/**
 * Validates food item eligibility for cart addition:
 * - Valid ObjectId format
 * - Food exists and is active (isActive: true)
 * - Food is available (availability: "available")
 * - Food has in-stock quantity (availableQuantity > 0)
 * - Category is active (Category.isActive: true)
 * - Associated chef is active (User.isActive: true) and approved (ChefProfile.approvalStatus: "approved")
 */
export const validateFoodEligibility = async (foodId) => {
  if (!foodId || !mongoose.Types.ObjectId.isValid(foodId)) {
    const error = new Error("Invalid Food ID format.");
    error.statusCode = 400;
    throw error;
  }

  const food = await Food.findById(foodId).populate("categoryId");
  if (!food) {
    const error = new Error("Food item not found.");
    error.statusCode = 404;
    throw error;
  }

  if (!food.isActive) {
    const error = new Error(`'${food.name}' is currently inactive and cannot be ordered.`);
    error.statusCode = 400;
    throw error;
  }

  if (food.availability !== "available") {
    const error = new Error(`'${food.name}' is currently marked unavailable by the kitchen.`);
    error.statusCode = 400;
    throw error;
  }

  if (food.availableQuantity <= 0) {
    const error = new Error(`'${food.name}' is currently out of stock.`);
    error.statusCode = 400;
    throw error;
  }

  if (!food.categoryId || !food.categoryId.isActive) {
    const error = new Error(`The category for '${food.name}' is currently inactive.`);
    error.statusCode = 400;
    throw error;
  }

  // Verify chef user is active
  const chefUser = await User.findOne({
    _id: food.chefId,
    isActive: true,
    role: "chef",
  });
  if (!chefUser) {
    const error = new Error("The home chef preparing this dish is currently inactive.");
    error.statusCode = 400;
    throw error;
  }

  // Verify chef profile is approved
  const chefProfile = await ChefProfile.findOne({
    userId: food.chefId,
    approvalStatus: "approved",
  });
  if (!chefProfile) {
    const error = new Error("The kitchen preparing this dish is not currently approved for orders.");
    error.statusCode = 400;
    throw error;
  }

  return { food, chefUser, chefProfile };
};

/**
 * Helper to recalculate and format cart response with current database prices and metadata.
 */
export const formatRecalculatedCart = async (cart) => {
  if (!cart) {
    return {
      items: [],
      chef: null,
      totalItems: 0,
      subtotal: 0,
    };
  }

  let chefInfo = null;
  if (cart.chefId) {
    const chefProfile = await ChefProfile.findOne({ userId: cart.chefId }).select(
      "_id userId kitchenName ownerName city cuisineTypes"
    );
    if (chefProfile) {
      chefInfo = {
        chefId: chefProfile._id,
        userId: chefProfile.userId,
        kitchenName: chefProfile.kitchenName,
        ownerName: chefProfile.ownerName,
        city: chefProfile.city,
        cuisineTypes: chefProfile.cuisineTypes,
      };
    }
  }

  const populatedItems = [];
  let subtotal = 0;
  let totalItems = 0;

  for (const item of cart.items) {
    const food = await Food.findById(item.foodId).select(
      "_id name image foodType price availableQuantity availability isActive categoryId"
    );

    if (food) {
      const currentPrice = food.price;
      const itemTotal = Number((currentPrice * item.quantity).toFixed(2));
      subtotal += itemTotal;
      totalItems += item.quantity;

      populatedItems.push({
        foodId: food._id,
        name: food.name,
        image: food.image,
        foodType: food.foodType,
        quantity: item.quantity,
        unitPrice: currentPrice, // Always fresh from DB!
        itemTotal,
        availableQuantity: food.availableQuantity,
        availability: food.availability,
        isActive: food.isActive,
      });
    }
  }

  subtotal = Number(subtotal.toFixed(2));

  return {
    _id: cart._id,
    customerId: cart.customerId,
    chef: chefInfo,
    items: populatedItems,
    totalItems,
    subtotal,
    updatedAt: cart.updatedAt,
  };
};

/**
 * GET Customer Cart
 * Retrieves and recalculates customer's cart using fresh database prices.
 */
export const getCustomerCart = async (customerId) => {
  let cart = await Cart.findOne({ customerId });

  if (!cart) {
    cart = await Cart.create({
      customerId,
      chefId: null,
      items: [],
    });
  }

  return await formatRecalculatedCart(cart);
};

/**
 * POST Add Food Item to Cart
 *
 * Rules:
 * - Single-chef constraint: Rejects food from another chef with clear error
 * - Never silently removes existing items
 * - Validates stock availability
 * - Deduplicates items by updating existing food quantity
 * - Recalculates prices from DB
 */
export const addItemToCart = async (customerId, { foodId, quantity }) => {
  const parsedQty = parseInt(quantity, 10);
  if (isNaN(parsedQty) || parsedQty < 1) {
    const error = new Error("Quantity must be a positive integer of at least 1.");
    error.statusCode = 400;
    throw error;
  }

  // 1. Validate food eligibility
  const { food, chefProfile } = await validateFoodEligibility(foodId);

  // 2. Find or create customer cart
  let cart = await Cart.findOne({ customerId });
  if (!cart) {
    cart = new Cart({
      customerId,
      chefId: null,
      items: [],
    });
  }

  // 3. Single-chef enforcement: Check if cart has items from another chef
  if (cart.items.length > 0 && cart.chefId) {
    if (cart.chefId.toString() !== food.chefId.toString()) {
      const existingChefProfile = await ChefProfile.findOne({ userId: cart.chefId });
      const currentKitchen = existingChefProfile ? existingChefProfile.kitchenName : "another kitchen";
      const error = new Error(
        `Your cart contains dishes from another home chef ('${currentKitchen}'). You can only order from one home kitchen at a time. Please clear your cart before adding items from '${chefProfile.kitchenName}'.`
      );
      error.statusCode = 409; // Conflict
      error.code = "MIXED_CHEF_CART";
      error.existingKitchen = currentKitchen;
      error.newKitchen = chefProfile.kitchenName;
      throw error;
    }
  }

  // 4. Check if food is already in cart (Prevent duplicate food entries)
  const existingItemIndex = cart.items.findIndex(
    (item) => item.foodId.toString() === food._id.toString()
  );

  if (existingItemIndex > -1) {
    const existingItem = cart.items[existingItemIndex];
    const newTotalQuantity = existingItem.quantity + parsedQty;

    // Validate combined stock
    if (newTotalQuantity > food.availableQuantity) {
      const error = new Error(
        `Cannot add ${parsedQty} more unit(s) of '${food.name}'. Available stock is ${food.availableQuantity}, and you already have ${existingItem.quantity} in your cart.`
      );
      error.statusCode = 400;
      throw error;
    }

    existingItem.quantity = newTotalQuantity;
    existingItem.priceAtAddition = food.price;
  } else {
    // Validate stock for new item
    if (parsedQty > food.availableQuantity) {
      const error = new Error(
        `Cannot add ${parsedQty} unit(s) of '${food.name}'. Only ${food.availableQuantity} available in stock.`
      );
      error.statusCode = 400;
      throw error;
    }

    cart.items.push({
      foodId: food._id,
      quantity: parsedQty,
      priceAtAddition: food.price,
    });
    cart.chefId = food.chefId;
  }

  await cart.save();
  return await formatRecalculatedCart(cart);
};

/**
 * PATCH Update Cart Item Quantity
 */
export const updateCartItemQuantity = async (customerId, foodId, quantity) => {
  if (!foodId || !mongoose.Types.ObjectId.isValid(foodId)) {
    const error = new Error("Invalid Food ID format.");
    error.statusCode = 400;
    throw error;
  }

  const parsedQty = parseInt(quantity, 10);
  if (isNaN(parsedQty) || parsedQty < 1) {
    const error = new Error("Quantity must be a positive integer (minimum 1). To remove an item, use the DELETE endpoint.");
    error.statusCode = 400;
    throw error;
  }

  const cart = await Cart.findOne({ customerId });
  if (!cart || cart.items.length === 0) {
    const error = new Error("Your cart is empty.");
    error.statusCode = 404;
    throw error;
  }

  const itemIndex = cart.items.findIndex(
    (item) => item.foodId.toString() === foodId.toString()
  );

  if (itemIndex === -1) {
    const error = new Error("Food item not found in your cart.");
    error.statusCode = 404;
    throw error;
  }

  // Validate food stock
  const food = await Food.findById(foodId);
  if (!food || !food.isActive || food.availability !== "available") {
    const error = new Error("This food item is no longer available.");
    error.statusCode = 400;
    throw error;
  }

  if (parsedQty > food.availableQuantity) {
    const error = new Error(
      `Insufficient stock for '${food.name}'. Only ${food.availableQuantity} available.`
    );
    error.statusCode = 400;
    throw error;
  }

  cart.items[itemIndex].quantity = parsedQty;
  cart.items[itemIndex].priceAtAddition = food.price;
  await cart.save();

  return await formatRecalculatedCart(cart);
};

/**
 * DELETE Remove Single Cart Item
 */
export const removeCartItem = async (customerId, foodId) => {
  if (!foodId || !mongoose.Types.ObjectId.isValid(foodId)) {
    const error = new Error("Invalid Food ID format.");
    error.statusCode = 400;
    throw error;
  }

  const cart = await Cart.findOne({ customerId });
  if (!cart || cart.items.length === 0) {
    const error = new Error("Your cart is empty.");
    error.statusCode = 404;
    throw error;
  }

  const itemIndex = cart.items.findIndex(
    (item) => item.foodId.toString() === foodId.toString()
  );

  if (itemIndex === -1) {
    const error = new Error("Food item not found in your cart.");
    error.statusCode = 404;
    throw error;
  }

  cart.items.splice(itemIndex, 1);

  // If cart is now empty, reset chefId
  if (cart.items.length === 0) {
    cart.chefId = null;
  }

  await cart.save();
  return await formatRecalculatedCart(cart);
};

/**
 * DELETE Clear Entire Cart
 */
export const clearCart = async (customerId) => {
  let cart = await Cart.findOne({ customerId });
  if (!cart) {
    cart = new Cart({ customerId, chefId: null, items: [] });
  } else {
    cart.items = [];
    cart.chefId = null;
    await cart.save();
  }

  return await formatRecalculatedCart(cart);
};
