import { processRazorpayWebhook } from "../Services/webhookService.js";
import { handlePayoutWebhookEvent, verifyPayoutWebhookSignature } from "../Services/payoutService.js";

/**
 * POST /api/webhooks/razorpay
 */
export async function handleRazorpayWebhook(req, res, next) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
      return res.status(400).json({ success: false, message: "Missing x-razorpay-signature header." });
    }

    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const result = await processRazorpayWebhook(rawBody, signature);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/webhooks/payouts
 */
export async function handleRazorpayPayoutWebhook(req, res, next) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

    // Verify signature if in production
    if (process.env.NODE_ENV === "production") {
      const isValid = verifyPayoutWebhookSignature(rawBody, signature);
      if (!isValid) {
        return res.status(400).json({ success: false, message: "Invalid Razorpay payout webhook signature." });
      }
    }

    let eventData = req.body;
    if (typeof eventData === "string") {
      eventData = JSON.parse(eventData);
    }

    const result = await handlePayoutWebhookEvent(eventData);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
