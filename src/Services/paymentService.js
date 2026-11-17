import mongoose from "mongoose";
import Payment from "../Models/Payment.js";
import Order from "../Models/Order.js";
import Subscription from "../Models/Subscription.js";
import ChefCommissionWallet from "../Models/ChefCommissionWallet.js";
import ChefCommissionTransaction from "../Models/ChefCommissionTransaction.js";
import { getPlatformConfig } from "./platformConfigService.js";
import {
  createGatewayOrder,
  verifyPaymentSignature,
} from "./razorpayService.js";
import { activateSubscriptionInternal } from "./subscriptionService.js";
import { sendDirectChefOrderNotification } from "./notificationService.js";

const generatePaymentNumber = () => {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `PAY-${timestamp}-${randomSuffix}`;
};

const generateTxNumber = (prefix = "TXN") => {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${timestamp}-${randomSuffix}`;
};

/**
 * CUSTOMER: Initiate payment for an Instant Order (online or COD)
 */
export async function initiateOrderPayment(customerId, orderId, paymentMethod = "online") {
  const order = await Order.findOne({ _id: orderId, customerId });
  if (!order) {
    const err = new Error("Order not found or does not belong to you.");
    err.statusCode = 404;
    throw err;
  }

  if (order.paymentStatus === "paid") {
    const err = new Error("Order is already paid.");
    err.statusCode = 400;
    throw err;
  }

  if (order.orderStatus === "cancelled" || order.orderStatus === "rejected") {
    const err = new Error(`Cannot pay for an order in status '${order.orderStatus}'.`);
    err.statusCode = 400;
    throw err;
  }

  const config = await getPlatformConfig();
  const baseAmountPaise = order.subtotalPaise || Math.round(order.subtotal * 100);
  const deliveryFeePaise = order.deliveryFeePaise || Math.round((order.deliveryFee || 0) * 100);
  const grossFoodAndDeliveryPaise = baseAmountPaise + deliveryFeePaise;

  if (paymentMethod === "online") {
    // Online Discount (default ₹20 / 2000 paise platform funded)
    const discountPaise = Math.min(grossFoodAndDeliveryPaise, config.onlineDiscountPaise);
    const payableAmountPaise = Math.max(0, grossFoodAndDeliveryPaise - discountPaise);
    const platformSubsidyPaise = discountPaise;

    // Create gateway order if payable > 0
    let gatewayOrder = null;
    if (payableAmountPaise > 0) {
      gatewayOrder = await createGatewayOrder({
        amountPaise: payableAmountPaise,
        currency: "INR",
        receipt: `ord_${order._id.toString().slice(-8)}`,
        notes: {
          orderId: order._id.toString(),
          customerId: customerId.toString(),
          orderNumber: order.orderNumber,
        },
      });
    }

    // Create Payment record
    const payment = new Payment({
      paymentNumber: generatePaymentNumber(),
      customerId,
      orderType: "instant_order",
      orderId: order._id,
      paymentProvider: "razorpay",
      paymentMethod: "online",
      razorpayOrderId: gatewayOrder?.id || null,
      currency: "INR",
      baseAmountPaise: grossFoodAndDeliveryPaise,
      onlineDiscountPaise: discountPaise,
      codFeePaise: 0,
      payableAmountPaise,
      platformSubsidyPaise,
      status: "created",
    });
    await payment.save();

    // Update order with payment snapshot
    order.paymentMethod = "online";
    order.paymentId = payment._id;
    order.onlineDiscountPaise = discountPaise;
    order.codFeePaise = 0;
    order.totalAmountPaise = payableAmountPaise;
    order.totalAmount = Number((payableAmountPaise / 100).toFixed(2));
    await order.save();

    return {
      success: true,
      paymentId: payment._id,
      paymentNumber: payment.paymentNumber,
      orderId: order._id,
      orderNumber: order.orderNumber,
      paymentMethod: "online",
      razorpayOrderId: gatewayOrder?.id || null,
      keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_gharkaswad_demo123",
      baseAmountPaise: grossFoodAndDeliveryPaise,
      onlineDiscountPaise: discountPaise,
      payableAmountPaise,
      currency: "INR",
    };
  } else if (paymentMethod === "cod") {
    // COD Mode: +₹20 COD fee, payable physically upon delivery
    const codFeePaise = config.codFeePaise;
    const payableAmountPaise = grossFoodAndDeliveryPaise + codFeePaise;

    const payment = new Payment({
      paymentNumber: generatePaymentNumber(),
      customerId,
      orderType: "instant_order",
      orderId: order._id,
      paymentProvider: "cod",
      paymentMethod: "cod",
      currency: "INR",
      baseAmountPaise: grossFoodAndDeliveryPaise,
      onlineDiscountPaise: 0,
      codFeePaise,
      payableAmountPaise,
      platformSubsidyPaise: 0,
      status: "created",
    });
    await payment.save();

    order.paymentMethod = "cod";
    order.paymentId = payment._id;
    order.onlineDiscountPaise = 0;
    order.codFeePaise = codFeePaise;
    order.totalAmountPaise = payableAmountPaise;
    order.totalAmount = Number((payableAmountPaise / 100).toFixed(2));
    order.codAmountDuePaise = payableAmountPaise;
    await order.save();

    return {
      success: true,
      paymentId: payment._id,
      paymentNumber: payment.paymentNumber,
      orderId: order._id,
      orderNumber: order.orderNumber,
      paymentMethod: "cod",
      baseAmountPaise: grossFoodAndDeliveryPaise,
      codFeePaise,
      payableAmountPaise,
      codAmountDuePaise: payableAmountPaise,
      message: "Order configured for Cash on Delivery. Cash to be collected at delivery.",
    };
  } else {
    const err = new Error("Invalid paymentMethod. Allowed: 'online', 'cod'.");
    err.statusCode = 400;
    throw err;
  }
}

/**
 * CUSTOMER: Initiate payment for a Subscription (online only)
 */
export async function initiateSubscriptionPayment(customerId, subscriptionId) {
  const subscription = await Subscription.findOne({ _id: subscriptionId, customerId });
  if (!subscription) {
    const err = new Error("Subscription not found or does not belong to you.");
    err.statusCode = 404;
    throw err;
  }

  if (subscription.paymentStatus === "paid" || subscription.subscriptionStatus === "active") {
    const err = new Error("Subscription is already active and paid.");
    err.statusCode = 400;
    throw err;
  }

  if (subscription.subscriptionStatus === "cancelled") {
    const err = new Error("Cancelled subscription cannot be paid.");
    err.statusCode = 400;
    throw err;
  }

  const config = await getPlatformConfig();
  const baseAmountPaise = subscription.totalAmountPaise || Math.round(subscription.totalAmount * 100);
  const discountPaise = Math.min(baseAmountPaise, config.onlineDiscountPaise);
  const payableAmountPaise = Math.max(0, baseAmountPaise - discountPaise);
  const platformSubsidyPaise = discountPaise;

  const gatewayOrder = await createGatewayOrder({
    amountPaise: payableAmountPaise,
    currency: "INR",
    receipt: `sub_${subscription._id.toString().slice(-8)}`,
    notes: {
      subscriptionId: subscription._id.toString(),
      customerId: customerId.toString(),
      subscriptionNumber: subscription.subscriptionNumber,
    },
  });

  const payment = new Payment({
    paymentNumber: generatePaymentNumber(),
    customerId,
    orderType: "subscription",
    subscriptionId: subscription._id,
    paymentProvider: "razorpay",
    paymentMethod: "online",
    razorpayOrderId: gatewayOrder?.id || null,
    currency: "INR",
    baseAmountPaise,
    onlineDiscountPaise: discountPaise,
    codFeePaise: 0,
    payableAmountPaise,
    platformSubsidyPaise,
    status: "created",
  });
  await payment.save();

  subscription.onlineDiscountPaise = discountPaise;
  subscription.paymentId = payment._id;
  await subscription.save();

  return {
    success: true,
    paymentId: payment._id,
    paymentNumber: payment.paymentNumber,
    subscriptionId: subscription._id,
    subscriptionNumber: subscription.subscriptionNumber,
    paymentMethod: "online",
    razorpayOrderId: gatewayOrder?.id || null,
    keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_gharkaswad_demo123",
    baseAmountPaise,
    onlineDiscountPaise: discountPaise,
    payableAmountPaise,
    currency: "INR",
  };
}

/**
 * CUSTOMER / INTERNAL: Verify online payment signature and mark paid/active
 */
export async function verifyAndCompletePayment(
  customerId,
  { paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature }
) {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    const err = new Error("razorpayOrderId, razorpayPaymentId, and razorpaySignature are required.");
    err.statusCode = 400;
    throw err;
  }

  const query = paymentId ? { _id: paymentId, customerId } : { razorpayOrderId, customerId };
  const payment = await Payment.findOne(query);
  if (!payment) {
    const err = new Error("Payment record not found.");
    err.statusCode = 404;
    throw err;
  }

  // Idempotency: if already captured, return success immediately
  if (payment.status === "captured") {
    return {
      success: true,
      alreadyCaptured: true,
      payment,
      message: "Payment was already verified and captured.",
    };
  }

  // Verify HMAC signature
  const isValid = verifyPaymentSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });

  if (!isValid) {
    payment.status = "failed";
    payment.failedAt = new Date();
    payment.failureReason = "Invalid Razorpay payment signature verification.";
    await payment.save();

    const err = new Error("Payment signature verification failed.");
    err.statusCode = 400;
    throw err;
  }

  payment.status = "captured";
  payment.razorpayPaymentId = razorpayPaymentId;
  payment.razorpaySignature = razorpaySignature;
  payment.capturedAt = new Date();
  await payment.save();

  let responseData = {
    success: true,
    paymentId: payment._id,
    paymentNumber: payment.paymentNumber,
    status: payment.status,
  };

  // Process according to orderType
  if (payment.orderType === "instant_order" && payment.orderId) {
    const order = await Order.findById(payment.orderId);
    if (order) {
      order.paymentStatus = "paid";
      await order.save();

      // Verified online payment: Notify the Chef immediately!
      sendDirectChefOrderNotification(order).catch((notifErr) =>
        console.error("[PaymentService] Error sending chef notification on paid order:", notifErr.message)
      );

      responseData.orderId = order._id;
      responseData.orderNumber = order.orderNumber;
      responseData.orderStatus = order.orderStatus;
      responseData.paymentStatus = order.paymentStatus;
    }
  } else if (payment.orderType === "subscription" && payment.subscriptionId) {
    const activationResult = await activateSubscriptionInternal(customerId, payment.subscriptionId, {
      paymentId: payment._id,
      razorpayPaymentId,
    });
    responseData.subscriptionId = activationResult.subscription._id;
    responseData.subscriptionStatus = activationResult.subscription.subscriptionStatus;
    responseData.paymentStatus = activationResult.subscription.paymentStatus;
  } else if (payment.orderType === "commission_recharge" && payment.chefId) {
    // Recharge Chef Commission Wallet
    await applyCommissionWalletRecharge(payment.chefId, payment.payableAmountPaise, payment._id);
    responseData.chefId = payment.chefId;
    responseData.rechargeAmountPaise = payment.payableAmountPaise;
  }

  return responseData;
}

/**
 * CHEF: Initiate Commission Wallet Recharge
 */
export async function initiateCommissionRecharge(chefId, amountRupees) {
  const config = await getPlatformConfig();
  const parsedAmount = Number(amountRupees);
  if (isNaN(parsedAmount) || parsedAmount < config.minimumRechargeRupees) {
    const err = new Error(
      `Minimum recharge amount is ₹${config.minimumRechargeRupees} (${config.minimumRechargePaise} paise).`
    );
    err.statusCode = 400;
    throw err;
  }

  const amountPaise = Math.round(parsedAmount * 100);
  const gatewayOrder = await createGatewayOrder({
    amountPaise,
    currency: "INR",
    receipt: `rcg_${chefId.toString().slice(-8)}`,
    notes: {
      chefId: chefId.toString(),
      type: "commission_recharge",
    },
  });

  const payment = new Payment({
    paymentNumber: generatePaymentNumber(),
    customerId: chefId, // chef is the payer here
    chefId,
    orderType: "commission_recharge",
    paymentProvider: "razorpay",
    paymentMethod: "online",
    razorpayOrderId: gatewayOrder?.id || null,
    currency: "INR",
    baseAmountPaise: amountPaise,
    onlineDiscountPaise: 0,
    codFeePaise: 0,
    payableAmountPaise: amountPaise,
    platformSubsidyPaise: 0,
    status: "created",
  });
  await payment.save();

  return {
    success: true,
    paymentId: payment._id,
    paymentNumber: payment.paymentNumber,
    razorpayOrderId: gatewayOrder?.id || null,
    keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_gharkaswad_demo123",
    amountPaise,
    amountRupees: parsedAmount,
    currency: "INR",
  };
}

/**
 * CHEF: Verify Commission Wallet Recharge
 */
export async function verifyCommissionRecharge(
  chefId,
  { paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature }
) {
  return verifyAndCompletePayment(chefId, {
    paymentId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });
}

/**
 * Internal helper to credit Chef Commission Wallet after recharge payment
 */
export async function applyCommissionWalletRecharge(chefId, amountPaise, paymentId = null, session = null) {
  let wallet = await ChefCommissionWallet.findOne({ chefId }).session(session);
  if (!wallet) {
    wallet = new ChefCommissionWallet({
      chefId,
      balancePaise: 0,
      availableBalancePaise: 0,
      reservedBalancePaise: 0,
    });
  }

  wallet.balancePaise += amountPaise;
  wallet.availableBalancePaise += amountPaise;
  await wallet.save({ session });

  const tx = new ChefCommissionTransaction({
    transactionNumber: generateTxNumber("CC-RCG"),
    chefId,
    commissionWalletId: wallet._id,
    transactionType: "recharge_credit",
    amountPaise,
    availableBalanceAfterPaise: wallet.availableBalancePaise,
    reservedBalanceAfterPaise: wallet.reservedBalancePaise,
    totalBalanceAfterPaise: wallet.balancePaise,
    description: `Prepaid commission wallet recharge of ₹${(amountPaise / 100).toFixed(2)} via online gateway`,
    idempotencyKey: paymentId ? `rcg-pay-${paymentId.toString()}` : undefined,
  });
  await tx.save({ session });

  return { wallet, tx };
}
