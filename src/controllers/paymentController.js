import {
  initiateOrderPayment,
  initiateSubscriptionPayment,
  verifyAndCompletePayment,
} from "../Services/paymentService.js";
import Payment from "../Models/Payment.js";

/**
 * POST /api/customer/payments/order
 * Body: { orderId, paymentMethod: "online" | "cod" }
 */
export async function createOrderPayment(req, res, next) {
  try {
    const { orderId, paymentMethod = "online" } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId is required." });
    }
    const result = await initiateOrderPayment(req.user._id, orderId, paymentMethod);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/customer/payments/subscription
 * Body: { subscriptionId }
 */
export async function createSubscriptionPayment(req, res, next) {
  try {
    const { subscriptionId } = req.body;
    if (!subscriptionId) {
      return res.status(400).json({ success: false, message: "subscriptionId is required." });
    }
    const result = await initiateSubscriptionPayment(req.user._id, subscriptionId);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/customer/payments/verify
 * Body: { paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature }
 */
export async function verifyPayment(req, res, next) {
  try {
    const result = await verifyAndCompletePayment(req.user._id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/customer/payments/:paymentId
 */
export async function getPaymentDetails(req, res, next) {
  try {
    const payment = await Payment.findOne({
      _id: req.params.paymentId,
      customerId: req.user._id,
    });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment record not found." });
    }
    return res.status(200).json({ success: true, payment });
  } catch (error) {
    next(error);
  }
}
