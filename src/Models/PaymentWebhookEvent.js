import mongoose from "mongoose";

const paymentWebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ["received", "processed", "ignored", "failed"],
      default: "received",
      index: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

paymentWebhookEventSchema.index({ eventType: 1, createdAt: -1 });

const PaymentWebhookEvent =
  mongoose.models.PaymentWebhookEvent ||
  mongoose.model("PaymentWebhookEvent", paymentWebhookEventSchema);

export default PaymentWebhookEvent;
