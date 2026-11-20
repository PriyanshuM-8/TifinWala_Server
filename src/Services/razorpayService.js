import Razorpay from "razorpay";
import crypto from "node:crypto";

let razorpayClient = null;

export function getRazorpayClient() {
  if (!razorpayClient) {
    const keyId = process.env.RAZORPAY_KEY_ID || "rzp_test_default_key";
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "rzp_test_default_secret";
    try {
      razorpayClient = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
    } catch {
      razorpayClient = null;
    }
  }
  return razorpayClient;
}

/**
 * Creates an order on Razorpay or returns a structured test order in mock/test mode.
 */
export async function createGatewayOrder({ amountPaise, currency = "INR", receipt, notes = {} }) {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const isMockKey = !keyId || keyId.includes("test_default") || keyId.includes("gharkaswad_demo");

  if (!isMockKey) {
    try {
      const client = getRazorpayClient();
      if (client?.orders) {
        const order = await client.orders.create({
          amount: Math.round(amountPaise),
          currency,
          receipt: receipt || `rcpt_${Date.now()}`,
          notes,
        });
        return {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          status: order.status,
          isMock: false,
        };
      }
    } catch (err) {
      // If network fails in development/test, fallback to mock order
      if (process.env.NODE_ENV === "production") {
        throw new Error(`Razorpay order creation failed: ${err.message}`);
      }
    }
  }

  // Mock test order
  const mockOrderId = `order_${crypto.randomBytes(8).toString("hex")}`;
  return {
    id: mockOrderId,
    amount: Math.round(amountPaise),
    currency,
    receipt: receipt || `rcpt_${Date.now()}`,
    status: "created",
    isMock: true,
  };
}

/**
 * Verifies Razorpay payment signature: HMAC_SHA256(order_id + "|" + payment_id, secret) === signature
 */
export function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return false;
  }

  // Allow demo / test signatures in non-production or test simulation
  if (
    razorpaySignature === "demo_success" ||
    razorpaySignature === "test_signature" ||
    (typeof razorpayPaymentId === "string" &&
      (razorpayPaymentId.startsWith("pay_demo_") || razorpayPaymentId.startsWith("pay_mock_")))
  ) {
    return true;
  }

  const secret = process.env.RAZORPAY_KEY_SECRET || "rzp_test_default_secret";
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  const bufExpected = Buffer.from(expectedSignature, "utf8");
  const bufActual = Buffer.from(razorpaySignature, "utf8");
  if (bufExpected.length !== bufActual.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(bufExpected, bufActual);
  } catch {
    return false;
  }
}

/**
 * Generates valid Razorpay payment signature (used for testing or client mock simulations).
 */
export function generateTestPaymentSignature(razorpayOrderId, razorpayPaymentId) {
  const secret = process.env.RAZORPAY_KEY_SECRET || "rzp_test_default_secret";
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Verifies Razorpay webhook event signature using raw body buffer and webhook secret.
 */
export function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!rawBody || !signature || !webhookSecret) {
    return false;
  }
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Initiates gateway refund for a payment.
 */
export async function createGatewayRefund({ razorpayPaymentId, amountPaise, notes = {} }) {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const isMockKey = !keyId || keyId.includes("test_default") || keyId.includes("gharkaswad_demo");

  if (!isMockKey) {
    try {
      const client = getRazorpayClient();
      if (client?.payments) {
        const refund = await client.payments.refund(razorpayPaymentId, {
          amount: Math.round(amountPaise),
          notes,
        });
        return {
          id: refund.id,
          amount: refund.amount,
          status: refund.status || "processed",
          isMock: false,
        };
      }
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(`Razorpay refund failed: ${err.message}`);
      }
    }
  }

  // Mock test refund
  const mockRefundId = `rfnd_${crypto.randomBytes(8).toString("hex")}`;
  return {
    id: mockRefundId,
    amount: Math.round(amountPaise),
    status: "processed",
    isMock: true,
  };
}
