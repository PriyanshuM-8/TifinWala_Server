import PaymentWebhookEvent from "../Models/PaymentWebhookEvent.js";
import Payment from "../Models/Payment.js";
import Order from "../Models/Order.js";
import Subscription from "../Models/Subscription.js";
import Refund from "../Models/Refund.js";
import { verifyWebhookSignature } from "./razorpayService.js";
import { activateSubscriptionInternal } from "./subscriptionService.js";
import { applyCommissionWalletRecharge } from "./paymentService.js";

/**
 * Handle incoming Razorpay webhook.
 */
export async function processRazorpayWebhook(rawBody, signature) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "rzp_webhook_secret_789";

  // Verify HMAC signature
  const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    const err = new Error("Invalid Razorpay webhook signature.");
    err.statusCode = 400;
    throw err;
  }

  let eventData;
  try {
    eventData = JSON.parse(rawBody.toString("utf8"));
  } catch {
    const err = new Error("Webhook payload is not valid JSON.");
    err.statusCode = 400;
    throw err;
  }

  const eventId = eventData.event_id || eventData.id || `evt_${Date.now()}_${Math.random()}`;
  const eventType = eventData.event;

  // Idempotency check
  let webhookRecord = await PaymentWebhookEvent.findOne({ eventId });
  if (webhookRecord && webhookRecord.status === "processed") {
    return {
      success: true,
      status: "ignored",
      reason: "duplicate_event",
      eventId,
    };
  }

  if (!webhookRecord) {
    webhookRecord = new PaymentWebhookEvent({
      eventId,
      eventType,
      payload: eventData,
      status: "received",
    });
    await webhookRecord.save();
  }

  try {
    const payload = eventData.payload;

    if (eventType === "payment.captured" || eventType === "order.paid") {
      const paymentEntity = payload.payment?.entity || {};
      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;

      if (orderId) {
        const payment = await Payment.findOne({ razorpayOrderId: orderId });
        if (payment && payment.status !== "captured") {
          payment.status = "captured";
          payment.razorpayPaymentId = paymentId;
          payment.capturedAt = new Date();
          await payment.save();

          if (payment.orderType === "instant_order" && payment.orderId) {
            await Order.findByIdAndUpdate(payment.orderId, { paymentStatus: "paid" });
          } else if (payment.orderType === "subscription" && payment.subscriptionId) {
            await activateSubscriptionInternal(payment.customerId, payment.subscriptionId, {
              paymentId: payment._id,
              razorpayPaymentId: paymentId,
            });
          } else if (payment.orderType === "commission_recharge" && payment.chefId) {
            await applyCommissionWalletRecharge(payment.chefId, payment.payableAmountPaise, payment._id);
          }
        }
      }
    } else if (eventType === "payment.failed") {
      const paymentEntity = payload.payment?.entity || {};
      const orderId = paymentEntity.order_id;
      if (orderId) {
        const payment = await Payment.findOne({ razorpayOrderId: orderId });
        if (payment && payment.status !== "captured") {
          payment.status = "failed";
          payment.failedAt = new Date();
          payment.failureReason = paymentEntity.error_description || "Payment failed via gateway";
          await payment.save();
        }
      }
    } else if (eventType === "refund.processed") {
      const refundEntity = payload.refund?.entity || {};
      const gatewayRefundId = refundEntity.id;
      if (gatewayRefundId) {
        await Refund.findOneAndUpdate(
          { gatewayRefundId },
          { status: "processed", processedAt: new Date() }
        );
      }
    }

    webhookRecord.status = "processed";
    webhookRecord.processedAt = new Date();
    await webhookRecord.save();

    return {
      success: true,
      status: "processed",
      eventId,
      eventType,
    };
  } catch (procErr) {
    webhookRecord.status = "failed";
    webhookRecord.errorMessage = procErr.message;
    await webhookRecord.save();
    throw procErr;
  }
}
