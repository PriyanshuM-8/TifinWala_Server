import express from "express";
import {
  handleRazorpayWebhook,
  handleRazorpayPayoutWebhook,
} from "../controllers/webhookController.js";

const router = express.Router();

router.post("/razorpay", handleRazorpayWebhook);
router.post("/payouts", handleRazorpayPayoutWebhook);

export default router;
