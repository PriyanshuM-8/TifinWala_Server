import mongoose from "mongoose";
import Order from "../Models/Order.js";
import Cart from "../Models/Cart.js";
import Food from "../Models/Food.js";
import Category from "../Models/Category.js";
import ChefProfile from "../Models/ChefProfile.js";
import User from "../Models/User.js";
import CustomerAddress from "../Models/CustomerAddress.js";
import { reserveStock, restoreStock } from "./inventoryService.js";
import { assertValidStatusTransition, ORDER_STATUSES } from "./orderStatusService.js";
import {
  evaluateAndReserveCommission,
  captureCommission,
  releaseCommissionReservation,
} from "./commissionService.js";
import {
  reserveCodOrderCommissionAndFee,
  captureCodOrderCommissionAndFee,
  releaseCodOrderCommissionAndFee,
} from "./codSettlementService.js";
import { settleOnlineOrderDelivery } from "./onlineSettlementService.js";
import { processOrderCancellationRefund } from "./refundService.js";
import {
  recordPendingChefEarning,
  confirmChefEarning,
  reversePendingChefEarning,
} from "./chefWalletService.js";
import ChefOrderSequence from "../Models/ChefOrderSequence.js";
import {
  sendDirectChefOrderNotification,
  sendOrderStatusNotification,
} from "./notificationService.js";

/**
 * Generates unique human-readable order number
 * Format: GKS-ORD-YYYYMMDD-XXXX
 */
const generateOrderNumber = () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `GKS-ORD-${dateStr}-${randomSuffix}`;
};

/**
 * CUSTOMER: Place Instant Order
 *
 * Requirements:
 * - Authenticated customer with non-empty cart
 * - Single-chef items only
 * - Fresh DB verification of chef (approved, active) and foods (active, available, stock, active category)
 * - Address snapshot for chef_delivery; pickup info for customer_pickup
 * - Atomic stock deduction with automatic rollback
 * - Idempotency protection via clientRequestId
 * - Cart cleared on success
 */
export const createCustomerOrder = async (customerId, orderData) => {
  const { deliveryType, addressId, clientRequestId, paymentMethod = null } = orderData;

  // 1. Idempotency Check: Prevent duplicate order creation on network retries
  if (clientRequestId && String(clientRequestId).trim() !== "") {
    const existingOrder = await Order.findOne({
      customerId,
      clientRequestId: String(clientRequestId).trim(),
    });
    if (existingOrder) {
      return { order: existingOrder, isExisting: true };
    }
  }

  // 2. Validate delivery type
  if (!deliveryType || !["chef_delivery", "customer_pickup"].includes(deliveryType)) {
    const error = new Error("Invalid deliveryType. Must be 'chef_delivery' or 'customer_pickup'.");
    error.statusCode = 400;
    throw error;
  }

  // 3. Load customer's cart
  const cart = await Cart.findOne({ customerId });
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    const error = new Error("Your cart is empty. Please add dishes before placing an order.");
    error.statusCode = 400;
    throw error;
  }

  if (!cart.chefId) {
    const error = new Error("Cart is corrupted: No chef assigned.");
    error.statusCode = 400;
    throw error;
  }

  // 4. Verify Chef is active and approved
  const chefUser = await User.findOne({
    _id: cart.chefId,
    isActive: true,
    role: "chef",
  });
  const chefProfile = await ChefProfile.findOne({
    userId: cart.chefId,
    approvalStatus: "approved",
  });

  if (!chefUser || !chefProfile) {
    const error = new Error(
      "The home kitchen is currently inactive or not approved to take orders."
    );
    error.statusCode = 400;
    throw error;
  }

  // 5. Verify and snapshot all food items
  const itemSnapshots = [];
  let subtotal = 0;

  for (const cartItem of cart.items) {
    const food = await Food.findById(cartItem.foodId).populate("categoryId");

    if (!food) {
      const error = new Error("One or more food items in your cart no longer exist.");
      error.statusCode = 400;
      throw error;
    }

    if (!food.isActive) {
      const error = new Error(`'${food.name}' is inactive and cannot be ordered.`);
      error.statusCode = 400;
      throw error;
    }

    if (food.availability !== "available") {
      const error = new Error(`'${food.name}' is currently marked unavailable by the chef.`);
      error.statusCode = 400;
      throw error;
    }

    if (food.availableQuantity < cartItem.quantity) {
      const error = new Error(
        `Insufficient stock for '${food.name}'. Available: ${food.availableQuantity}, Requested: ${cartItem.quantity}.`
      );
      error.statusCode = 400;
      throw error;
    }

    if (!food.categoryId || !food.categoryId.isActive) {
      const error = new Error(`The category for '${food.name}' is currently inactive.`);
      error.statusCode = 400;
      throw error;
    }

    // Ensure item belongs to the designated chef
    if (food.chefId.toString() !== cart.chefId.toString()) {
      const error = new Error("Mixed-chef cart detected. All items must belong to the same kitchen.");
      error.statusCode = 400;
      throw error;
    }

    const currentPrice = food.price;
    const itemTotal = Number((currentPrice * cartItem.quantity).toFixed(2));
    subtotal += itemTotal;

    itemSnapshots.push({
      foodId: food._id,
      foodName: food.name,
      foodImage: food.image,
      foodType: food.foodType,
      quantity: cartItem.quantity,
      unitPrice: currentPrice,
      itemTotal,
    });
  }

  subtotal = Number(subtotal.toFixed(2));
  const deliveryFee = 0; // Default zero as per business rules
  const totalAmount = Number((subtotal + deliveryFee).toFixed(2));

  // 6. Handle Delivery Address Snapshot for chef_delivery
  let deliveryAddressSnapshot = undefined;
  if (deliveryType === "chef_delivery") {
    if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
      const error = new Error("A valid delivery addressId is required for chef_delivery.");
      error.statusCode = 400;
      throw error;
    }

    const customerAddress = await CustomerAddress.findOne({
      _id: addressId,
      userId: customerId,
    });

    if (!customerAddress) {
      const error = new Error("The selected delivery address does not exist or does not belong to you.");
      error.statusCode = 400;
      throw error;
    }

    deliveryAddressSnapshot = {
      fullName: customerAddress.fullName,
      phone: customerAddress.phone,
      addressType: customerAddress.addressType,
      addressLine: customerAddress.addressLine,
      landmark: customerAddress.landmark || "",
      city: customerAddress.city,
      state: customerAddress.state,
      pincode: customerAddress.pincode,
      location: customerAddress.location,
    };
  }

  // 7. Handle Pickup Information for customer_pickup
  let pickupInformation = undefined;
  if (deliveryType === "customer_pickup") {
    pickupInformation = {
      kitchenName: chefProfile.kitchenName,
      ownerName: chefProfile.ownerName,
      city: chefProfile.city,
      pickupInstructions:
        "Please collect your freshly prepared meal from the kitchen upon receiving the 'ready_for_pickup' notification.",
      kitchenAddress: chefProfile.kitchenAddress,
    };
  }

  // 8. Atomically Reserve Inventory Stock
  await reserveStock(itemSnapshots);

  // 9. Create and Save Order
  let order;
  try {
    let orderNum = generateOrderNumber();
    // Ensure uniqueness
    while (await Order.findOne({ orderNumber: orderNum })) {
      orderNum = generateOrderNumber();
    }

    const basePaise = Math.round(subtotal * 100);
    const feePaise = Math.round(deliveryFee * 100);
    const grossPaise = basePaise + feePaise;

    let finalTotalPaise = grossPaise;
    let onlineDiscountPaise = 0;
    let codFeePaise = 0;
    let codAmountDuePaise = 0;

    if (paymentMethod === "cod") {
      codFeePaise = 2000;
      finalTotalPaise = grossPaise + codFeePaise;
      codAmountDuePaise = finalTotalPaise;
    } else if (paymentMethod === "online") {
      onlineDiscountPaise = Math.min(grossPaise, 2000);
      finalTotalPaise = Math.max(0, grossPaise - onlineDiscountPaise);
    }

    order = await Order.create({
      orderNumber: orderNum,
      customerId,
      chefId: cart.chefId,
      items: itemSnapshots,
      deliveryType,
      ...(deliveryAddressSnapshot && { deliveryAddressSnapshot }),
      ...(pickupInformation && { pickupInformation }),
      subtotal,
      deliveryFee,
      totalAmount: Number((finalTotalPaise / 100).toFixed(2)),
      subtotalPaise: basePaise,
      deliveryFeePaise: feePaise,
      onlineDiscountPaise,
      codFeePaise,
      totalAmountPaise: finalTotalPaise,
      codAmountDuePaise,
      paymentMethod,
      orderStatus: ORDER_STATUSES.PENDING_CONFIRMATION,
      paymentStatus: "pending",
      ...(clientRequestId && { clientRequestId: String(clientRequestId).trim() }),
      stockRestored: false,
    });
  } catch (error) {
    // If order record creation fails, restore reserved stock immediately
    for (const item of itemSnapshots) {
      await Food.updateOne({ _id: item.foodId }, { $inc: { availableQuantity: item.quantity } });
    }
    throw error;
  }

  // 10. Clear Customer Cart after successful order placement
  cart.items = [];
  cart.chefId = null;
  await cart.save();

  // 11. Payment-Aware Direct Chef Notification:
  // Notify chef immediately for new orders
  sendDirectChefOrderNotification(order).catch((err) =>
    console.error("[OrderService] Error sending chef notification:", err.message)
  );

  return { order, isExisting: false };
};

/**
 * CUSTOMER: Get Order History with filters & pagination
 */
export const getCustomerOrders = async (customerId, queryParams = {}) => {
  const { status, page = 1, limit = 10 } = queryParams;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const filter = { customerId };
  if (status && String(status).trim() !== "") {
    filter.orderStatus = String(status).trim();
  }

  const totalItems = await Order.countDocuments(filter);
  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  // Attach safe public chef info for customer orders
  const ordersWithChefInfo = await Promise.all(
    orders.map(async (order) => {
      const chefProfile = await ChefProfile.findOne({ userId: order.chefId }).select(
        "_id kitchenName ownerName city cuisineTypes"
      );
      const orderObj = order.toObject();
      orderObj.kitchen = chefProfile
        ? {
            chefId: chefProfile._id,
            kitchenName: chefProfile.kitchenName,
            ownerName: chefProfile.ownerName,
            city: chefProfile.city,
            cuisineTypes: chefProfile.cuisineTypes,
          }
        : null;
      return orderObj;
    })
  );

  return {
    orders: ordersWithChefInfo,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(totalItems / limitNum) || (totalItems === 0 ? 0 : 1),
      totalItems,
      limit: limitNum,
    },
  };
};

/**
 * CUSTOMER: Get Single Order Details
 */
export const getCustomerOrderById = async (customerId, orderId) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid Order ID format.");
    error.statusCode = 400;
    throw error;
  }

  const order = await Order.findOne({ _id: orderId, customerId });
  if (!order) {
    const error = new Error("Order not found or does not belong to you.");
    error.statusCode = 404;
    throw error;
  }

  const chefProfile = await ChefProfile.findOne({ userId: order.chefId }).select(
    "_id kitchenName ownerName city cuisineTypes"
  );

  const orderObj = order.toObject();
  orderObj.kitchen = chefProfile
    ? {
        chefId: chefProfile._id,
        kitchenName: chefProfile.kitchenName,
        ownerName: chefProfile.ownerName,
        city: chefProfile.city,
        cuisineTypes: chefProfile.cuisineTypes,
      }
    : null;

  return orderObj;
};

/**
 * CUSTOMER: Cancel Eligible Order
 *
 * Rules:
 * - Can only cancel pending_confirmation orders
 * - Orders cannot be cancelled after chef acceptance or delivery
 * - Restores reserved stock exactly once
 */
export const cancelOrderByCustomer = async (customerId, orderId, cancellationReason) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid Order ID format.");
    error.statusCode = 400;
    throw error;
  }

  const order = await Order.findOne({ _id: orderId, customerId });
  if (!order) {
    const error = new Error("Order not found or does not belong to you.");
    error.statusCode = 404;
    throw error;
  }

  if (order.orderStatus === ORDER_STATUSES.DELIVERED) {
    const error = new Error("Delivered orders cannot be cancelled.");
    error.statusCode = 400;
    throw error;
  }

  if (
    ![ORDER_STATUSES.PENDING_CONFIRMATION, ORDER_STATUSES.ACCEPTED].includes(order.orderStatus)
  ) {
    const error = new Error(
      `Order cannot be cancelled in '${order.orderStatus}' status. Cancellations are only permitted while pending chef confirmation or before food preparation begins.`
    );
    error.statusCode = 400;
    throw error;
  }

  order.orderStatus = ORDER_STATUSES.CANCELLED;
  order.cancellationReason = cancellationReason || "Cancelled by customer";
  order.cancelledBy = customerId;
  order.cancelledAt = new Date();
  await order.save();

  // Send status update notification
  sendOrderStatusNotification(order, "cancelled").catch((err) =>
    console.error("[OrderService] Error sending cancel status notification:", err.message)
  );

  // Restore inventory stock exactly once
  await restoreStock(order);

  // Release any commission reservation and reverse pending earnings
  if (order.paymentMethod === "cod") {
    await releaseCodOrderCommissionAndFee(order.chefId, order);
  } else if (order.paymentMethod === "online" && order.paymentId) {
    await processOrderCancellationRefund(order, cancellationReason);
  } else {
    await releaseCommissionReservation({
      chefId: order.chefId,
      orderId: order._id,
      orderNumber: order.orderNumber,
      reason: cancellationReason || "Cancelled by customer",
    });
  }
  await reversePendingChefEarning({
    chefId: order.chefId,
    orderId: order._id,
    reason: cancellationReason || "Cancelled by customer",
  });

  return order;
};

// Helper to resolve possible Chef IDs (User._id and ChefProfile._id)
const resolveChefIds = async (chefUserId) => {
  const ids = [chefUserId];
  try {
    const chefProfile = await ChefProfile.findOne({
      $or: [{ userId: chefUserId }, { _id: chefUserId }],
    });
    if (chefProfile) {
      if (chefProfile._id && !ids.some((i) => i.toString() === chefProfile._id.toString())) {
        ids.push(chefProfile._id);
      }
      if (chefProfile.userId && !ids.some((i) => i.toString() === chefProfile.userId.toString())) {
        ids.push(chefProfile.userId);
      }
    }
  } catch (err) {
    // ignore
  }
  return ids;
};

/**
 * CHEF: Get Incoming / Assigned Orders
 */
export const getChefOrders = async (chefUserId, queryParams = {}) => {
  const { status, page = 1, limit = 10 } = queryParams;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const possibleChefIds = await resolveChefIds(chefUserId);
  const filter = { chefId: { $in: possibleChefIds } };
  if (status && String(status).trim() !== "" && String(status).trim() !== "all") {
    const trimmedStatus = String(status).trim();
    if (trimmedStatus === "dispatch") {
      filter.orderStatus = {
        $in: [ORDER_STATUSES.OUT_FOR_DELIVERY, ORDER_STATUSES.READY_FOR_PICKUP],
      };
    } else {
      filter.orderStatus = trimmedStatus;
    }
  }

  const totalItems = await Order.countDocuments(filter);
  const orders = await Order.find(filter)
    .populate("customerId", "name phone email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  const formattedOrders = orders.map((order) => {
    const obj = order.toObject ? order.toObject() : { ...order };
    obj.status = obj.orderStatus;
    return obj;
  });

  return {
    orders: formattedOrders,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(totalItems / limitNum) || (totalItems === 0 ? 0 : 1),
      totalItems,
      limit: limitNum,
    },
  };
};

/**
 * CHEF: Get Single Order Details
 */
export const getChefOrderById = async (chefUserId, orderId) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid Order ID format.");
    error.statusCode = 400;
    throw error;
  }

  const possibleChefIds = await resolveChefIds(chefUserId);
  const order = await Order.findOne({ _id: orderId, chefId: { $in: possibleChefIds } }).populate(
    "customerId",
    "name phone email"
  );

  if (!order) {
    const error = new Error("Order not found or does not belong to your kitchen.");
    error.statusCode = 404;
    throw error;
  }

  const obj = order.toObject ? order.toObject() : { ...order };
  obj.status = obj.orderStatus;
  return obj;
};

/**
 * CHEF: Accept Pending Order
 */
export const acceptOrderByChef = async (chefUserId, orderId) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid Order ID format.");
    error.statusCode = 400;
    throw error;
  }

  const possibleChefIds = await resolveChefIds(chefUserId);
  const order = await Order.findOne({ _id: orderId, chefId: { $in: possibleChefIds } });
  if (!order) {
    const error = new Error("Order not found or does not belong to your kitchen.");
    error.statusCode = 404;
    throw error;
  }

  assertValidStatusTransition(
    order.orderStatus,
    ORDER_STATUSES.ACCEPTED,
    order.deliveryType
  );

  // Phase 10 & Phase 9: Commission policy & reservation
  const grossAmountPaise = Math.round(order.totalAmount * 100);

  if (order.paymentMethod === "cod") {
    await reserveCodOrderCommissionAndFee(chefUserId, order);
  } else if (order.paymentMethod === "online") {
    // Online orders: platform holds customer's payment; commission is settled on delivery.
    // Ensure ChefOrderSequence is updated if first order benefit applies:
    let sequence = await ChefOrderSequence.findOne({ chefId: chefUserId });
    if (!sequence || !sequence.hasUsedFirstOrderFreeBenefit) {
      await ChefOrderSequence.findOneAndUpdate(
        { chefId: chefUserId, hasUsedFirstOrderFreeBenefit: false },
        {
          $set: {
            hasUsedFirstOrderFreeBenefit: true,
            firstOrderId: order._id,
            firstOrderAcceptedAt: new Date(),
          },
          $inc: { acceptedOrderCount: 1 },
        },
        { upsert: true, new: true }
      );
    } else {
      await ChefOrderSequence.findOneAndUpdate(
        { chefId: chefUserId },
        { $inc: { acceptedOrderCount: 1 } },
        { upsert: true }
      );
    }
  } else {
    // Fallback for Phase 9 orders without paymentMethod
    await evaluateAndReserveCommission({
      chefId: chefUserId,
      orderId: order._id,
      basePaise: grossAmountPaise,
      orderNumber: order.orderNumber,
    });
  }

  // Record pending chef earning
  const foodDetails = order.items.map((it) => ({
    foodId: it.foodId,
    foodName: it.foodName,
    quantity: it.quantity,
    unitPricePaise: Math.round(it.unitPrice * 100),
    itemTotalPaise: Math.round(it.itemTotal * 100),
  }));

  await recordPendingChefEarning({
    chefId: chefUserId,
    sourceType: "instant_order",
    orderId: order._id,
    orderNumber: order.orderNumber,
    grossAmountPaise,
    foodDetails,
    earningDateKey: new Date().toISOString().slice(0, 10),
  });

  order.orderStatus = ORDER_STATUSES.ACCEPTED;
  order.acceptedAt = new Date();
  await order.save();

  // Send status update notification to customer
  sendOrderStatusNotification(order, "accepted").catch((err) =>
    console.error("[OrderService] Error sending accepted status notification:", err.message)
  );

  const obj = order.toObject ? order.toObject() : { ...order };
  obj.status = obj.orderStatus;
  return obj;
};

/**
 * CHEF: Reject Pending Order
 * Rejection restores reserved stock exactly once.
 */
export const rejectOrderByChef = async (chefUserId, orderId, rejectionReason) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid Order ID format.");
    error.statusCode = 400;
    throw error;
  }

  const possibleChefIds = await resolveChefIds(chefUserId);
  const order = await Order.findOne({ _id: orderId, chefId: { $in: possibleChefIds } });
  if (!order) {
    const error = new Error("Order not found or does not belong to your kitchen.");
    error.statusCode = 404;
    throw error;
  }

  if (!rejectionReason || !String(rejectionReason).trim()) {
    const error = new Error("A valid rejection reason must be provided.");
    error.statusCode = 400;
    throw error;
  }

  assertValidStatusTransition(
    order.orderStatus,
    ORDER_STATUSES.REJECTED,
    order.deliveryType
  );

  order.orderStatus = ORDER_STATUSES.REJECTED;
  order.chefRejectionReason = String(rejectionReason).trim();
  order.rejectedAt = new Date();
  await order.save();

  // Send status update notification to customer
  sendOrderStatusNotification(order, "rejected", { rejectionReason }).catch((err) =>
    console.error("[OrderService] Error sending rejected status notification:", err.message)
  );

  // Restore inventory stock exactly once
  await restoreStock(order);

  // Release any commission reservation and reverse pending earnings
  if (order.paymentMethod === "cod") {
    await releaseCodOrderCommissionAndFee(order.chefId, order);
  } else if (order.paymentMethod === "online" && order.paymentId) {
    await processOrderCancellationRefund(order, rejectionReason);
  } else {
    await releaseCommissionReservation({
      chefId: order.chefId,
      orderId: order._id,
      orderNumber: order.orderNumber,
      reason: rejectionReason || "Rejected by chef",
    });
  }
  await reversePendingChefEarning({
    chefId: order.chefId,
    orderId: order._id,
    reason: rejectionReason || "Rejected by chef",
  });

  const obj = order.toObject ? order.toObject() : { ...order };
  obj.status = obj.orderStatus;
  return obj;
};

/**
 * CHEF: Advance Order Status (preparing -> ready_for_pickup / out_for_delivery -> delivered)
 */
export const updateChefOrderStatus = async (chefUserId, orderId, newStatus) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid Order ID format.");
    error.statusCode = 400;
    throw error;
  }

  const possibleChefIds = await resolveChefIds(chefUserId);
  const order = await Order.findOne({ _id: orderId, chefId: { $in: possibleChefIds } });
  if (!order) {
    const error = new Error("Order not found or does not belong to your kitchen.");
    error.statusCode = 404;
    throw error;
  }

  assertValidStatusTransition(
    order.orderStatus,
    newStatus,
    order.deliveryType
  );

  order.orderStatus = newStatus;

  if (newStatus === ORDER_STATUSES.DELIVERED) {
    order.deliveredAt = new Date();

    // Phase 10 & Phase 9: Capture commission and confirm chef earning
    try {
      const canonicalChefId = (await resolveChefIds(chefUserId))[0] || chefUserId;
      if (order.paymentMethod === "cod") {
        await captureCodOrderCommissionAndFee(canonicalChefId, order);
        order.paymentStatus = "paid";
        order.settlementStatus = "settled";
      } else if (order.paymentMethod === "online") {
        await settleOnlineOrderDelivery(canonicalChefId, order);
        order.paymentStatus = "paid";
        order.settlementStatus = "settled";
      } else {
        // Fallback for Phase 9 orders without paymentMethod
        const seq = await ChefOrderSequence.findOne({ chefId: canonicalChefId });
        const isFirstOrder =
          seq &&
          seq.firstOrderId &&
          seq.firstOrderId.toString() === order._id.toString();

        const grossAmountPaise = Math.round(order.totalAmount * 100);

        const commissionResult = await captureCommission({
          chefId: canonicalChefId,
          orderId: order._id,
          finalBasePaise: grossAmountPaise,
          isFirstOrder: Boolean(isFirstOrder),
          orderNumber: order.orderNumber,
        });

        await confirmChefEarning({
          chefId: canonicalChefId,
          orderId: order._id,
          commissionDeductedPaise: commissionResult?.capturedPaise || 0,
        });
        order.paymentStatus = "paid";
        order.settlementStatus = "settled";
      }
    } catch (earningErr) {
      console.error(
        "[OrderService] Chef earning / commission capture hook error:",
        earningErr.message
      );
    }
  }

  await order.save();

  // Send status update notification to customer
  sendOrderStatusNotification(order, newStatus).catch((err) =>
    console.error("[OrderService] Error sending status update notification:", err.message)
  );

  const obj = order.toObject ? order.toObject() : { ...order };
  obj.status = obj.orderStatus;
  return obj;
};
