import { processRazorpayWebhook } from "../Services/webhookService.js";

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
