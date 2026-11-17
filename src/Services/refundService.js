import crypto from "node:crypto";
import Refund from "../Models/Refund.js";
import Payment from "../Models/Payment.js";
import Order from "../Models/Order.js";
import Subscription from "../Models/Subscription.js";
import ChefWallet from "../Models/ChefWallet.js";
import ChefEarning from "../Models/ChefEarning.js";
import AdminWallet from "../Models/AdminWallet.js";
import AdminWalletTransaction from "../Models/AdminWalletTransaction.js";
import ChefRecoveryClaim from "../Models/ChefRecoveryClaim.js";
import { createGatewayRefund } from "./razorpayService.js";
import { releaseCodOrderCommissionAndFee } from "./codSettlementService.js";
import { logAdminAction } from "./auditLogService.js";

const generateRefundNumber = () => {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `REF-${timestamp}-${randomSuffix}`;
};

const generateClaimNumber = () => {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `CLM-${timestamp}-${randomSuffix}`;
};

/**
 * CUSTOMER / CHEF / ADMIN: Process refund for cancelled instant order
 */
export async function processOrderCancellationRefund(order, cancellationReason, session = null) {
  if (order.paymentMethod === "cod") {
    // For COD, release any reserved commission and COD fee
    await releaseCodOrderCommissionAndFee(order.chefId, order, session);
    return {
      refundRequired: false,
      message: "COD order cancelled. Reserved chef commission and COD fee released.",
    };
  }

  // Online paid order
  if (order.paymentStatus !== "paid") {
    return {
      refundRequired: false,
      message: "Order was not paid yet. No gateway refund required.",
    };
  }

  const payment = await Payment.findOne({
    $or: [{ orderId: order._id }, { _id: order.paymentId }],
    status: "captured",
  }).session(session);

  if (!payment) {
    return {
      refundRequired: false,
      message: "No captured payment found for this order.",
    };
  }

  const refundAmountPaise = payment.payableAmountPaise;

  // Initiate gateway refund
  const gatewayRefund = await createGatewayRefund({
    razorpayPaymentId: payment.razorpayPaymentId,
    amountPaise: refundAmountPaise,
    notes: {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      reason: cancellationReason || "Order cancelled before preparation",
    },
  });

  const refund = new Refund({
    refundNumber: generateRefundNumber(),
    paymentId: payment._id,
    orderId: order._id,
    customerId: order.customerId,
    chefId: order.chefId,
    amountPaise: refundAmountPaise,
    gatewayRefundId: gatewayRefund.id,
    reason: cancellationReason || "Order cancelled before preparation",
    refundType: "instant_order_cancellation",
    status: "processed",
    processedAt: new Date(),
    idempotencyKey: `ref_cancel_${order._id.toString()}`,
  });
  await refund.save({ session });

  // Update payment and order
  payment.status = "refunded";
  await payment.save({ session });

  order.paymentStatus = "refunded";
  await order.save({ session });

  return {
    refundRequired: true,
    refund,
    refundAmountPaise,
    refundAmountRupees: refundAmountPaise / 100,
    gatewayRefundId: gatewayRefund.id,
  };
}

/**
 * ADMIN: Process refund for a disputed delivered order.
 * Handles zero-negative-balance enforcement via ChefRecoveryClaim.
 */
export async function processDisputeDeliveredOrderRefund(
  orderId,
  adminUserId,
  disputeReason,
  refundAmountPaise = null
) {
  const order = await Order.findById(orderId);
  if (!order) {
    const err = new Error("Order not found.");
    err.statusCode = 404;
    throw err;
  }

  if (order.orderStatus !== "delivered") {
    const err = new Error("Dispute refund is only applicable to delivered orders.");
    err.statusCode = 400;
    throw err;
  }

  const payment = await Payment.findOne({
    $or: [{ orderId: order._id }, { _id: order.paymentId }],
  });

  const targetRefundPaise = refundAmountPaise
    ? Math.round(Number(refundAmountPaise))
    : payment?.payableAmountPaise || order.totalAmountPaise;

  let gatewayRefund = { id: `rfnd_disp_${Date.now()}` };
  if (payment?.razorpayPaymentId) {
    gatewayRefund = await createGatewayRefund({
      razorpayPaymentId: payment.razorpayPaymentId,
      amountPaise: targetRefundPaise,
      notes: { orderId: order._id.toString(), disputeReason },
    });
  }

  // Create Refund record
  const refund = new Refund({
    refundNumber: generateRefundNumber(),
    paymentId: payment ? payment._id : order._id,
    orderId: order._id,
    customerId: order.customerId,
    chefId: order.chefId,
    amountPaise: targetRefundPaise,
    gatewayRefundId: gatewayRefund.id,
    reason: disputeReason || "Delivered order dispute resolved in favor of customer",
    refundType: "order_dispute",
    status: "processed",
    processedAt: new Date(),
    idempotencyKey: `ref_disp_${order._id.toString()}`,
  });
  await refund.save();

  // Find Chef Earning
  const earning = await ChefEarning.findOne({ orderId: order._id });
  const chefNetPaise = earning ? earning.netEarningsPaise : 0;
  const commissionPaise = earning ? earning.commissionDeductedPaise : 0;

  // Zero-negative-balance rule on ChefWallet
  let wallet = await ChefWallet.findOne({ chefId: order.chefId });
  let claim = null;

  if (wallet && chefNetPaise > 0) {
    if (wallet.availableBalancePaise >= chefNetPaise) {
      wallet.availableBalancePaise -= chefNetPaise;
      wallet.totalEarnedPaise = Math.max(0, wallet.totalEarnedPaise - chefNetPaise);
      await wallet.save();
    } else {
      const recoveredPart = wallet.availableBalancePaise;
      const deficit = chefNetPaise - recoveredPart;
      wallet.availableBalancePaise = 0;
      wallet.totalEarnedPaise = Math.max(0, wallet.totalEarnedPaise - recoveredPart);
      await wallet.save();

      // Create Recovery Claim for future offset
      claim = new ChefRecoveryClaim({
        claimNumber: generateClaimNumber(),
        chefId: order.chefId,
        orderId: order._id,
        claimedAmountPaise: chefNetPaise,
        recoveredAmountPaise: recoveredPart,
        remainingAmountPaise: deficit,
        reason: `Deficit from dispute refund on delivered order ${order.orderNumber}`,
        status: "pending",
      });
      await claim.save();
    }
  }

  // Reverse Commission in AdminWallet
  if (commissionPaise > 0) {
    let adminWallet = await AdminWallet.findOne({ walletType: "platform_commission" });
    if (adminWallet) {
      adminWallet.availableBalancePaise = Math.max(0, adminWallet.availableBalancePaise - commissionPaise);
      adminWallet.settledBalancePaise = Math.max(0, adminWallet.settledBalancePaise - commissionPaise);
      await adminWallet.save();

      const adminRevTx = new AdminWalletTransaction({
        transactionNumber: `ADM-REV-${Date.now()}`,
        adminWalletId: adminWallet._id,
        chefId: order.chefId,
        transactionType: "commission_reversal",
        amountPaise: commissionPaise,
        balanceAfterPaise: adminWallet.availableBalancePaise,
        orderId: order._id,
        description: `Commission reversal for disputed delivered order ${order.orderNumber}`,
        idempotencyKey: `adm_rev_disp_${order._id.toString()}`,
      });
      await adminRevTx.save();
    }
  }

  // Mark order
  order.settlementStatus = "disputed";
  order.paymentStatus = "refunded";
  await order.save();

  if (earning) {
    earning.status = "reversed";
    earning.reversedAt = new Date();
    earning.reversalReason = disputeReason;
    await earning.save();
  }

  await logAdminAction({
    adminId: adminUserId,
    actionType: "order_dispute_refund",
    targetEntityType: "Order",
    targetEntityId: order._id,
    previousState: { settlementStatus: "settled", paymentStatus: "paid" },
    newState: { settlementStatus: "disputed", paymentStatus: "refunded" },
    reason: `Dispute refund of ₹${(refund.amountPaise / 100).toFixed(2)} processed for order #${order.orderNumber}. Reason: ${disputeReason}`,
    metadata: { refundId: refund._id, claimId: claim?._id || null },
  });

  return {
    success: true,
    refund,
    claim,
    message: "Dispute refund processed successfully. Negative balance strictly prevented.",
  };
}

/**
 * CUSTOMER / ADMIN: Process partial refund for cancelled subscription
 */
export async function processSubscriptionCancellationRefund(
  subscription,
  unusedMealsCount,
  totalMealsCount,
  cancellationReason,
  session = null
) {
  if (subscription.paymentStatus !== "paid") {
    return {
      refundRequired: false,
      message: "Subscription was not paid. No refund required.",
    };
  }

  const payment = await Payment.findOne({
    $or: [{ subscriptionId: subscription._id }, { _id: subscription.paymentId }],
    status: "captured",
  }).session(session);

  if (!payment) {
    return {
      refundRequired: false,
      message: "No captured payment found for this subscription.",
    };
  }

  const totalPaidPaise = payment.payableAmountPaise;
  const refundAmountPaise = Math.round((unusedMealsCount / totalMealsCount) * totalPaidPaise);

  if (refundAmountPaise <= 0) {
    return {
      refundRequired: false,
      message: "No unused meals remaining to refund.",
    };
  }

  const gatewayRefund = await createGatewayRefund({
    razorpayPaymentId: payment.razorpayPaymentId,
    amountPaise: refundAmountPaise,
    notes: {
      subscriptionId: subscription._id.toString(),
      subscriptionNumber: subscription.subscriptionNumber,
      unusedMealsCount,
      totalMealsCount,
      reason: cancellationReason,
    },
  });

  const refund = new Refund({
    refundNumber: generateRefundNumber(),
    paymentId: payment._id,
    subscriptionId: subscription._id,
    customerId: subscription.customerId,
    amountPaise: refundAmountPaise,
    gatewayRefundId: gatewayRefund.id,
    reason: cancellationReason || "Partial refund for cancelled subscription unused meals",
    refundType: "subscription_cancellation",
    status: "processed",
    processedAt: new Date(),
    idempotencyKey: `ref_sub_${subscription._id.toString()}`,
  });
  await refund.save({ session });

  subscription.refundedAmountPaise = (subscription.refundedAmountPaise || 0) + refundAmountPaise;
  await subscription.save({ session });

  return {
    refundRequired: true,
    refund,
    refundAmountPaise,
    refundAmountRupees: refundAmountPaise / 100,
    gatewayRefundId: gatewayRefund.id,
  };
}
