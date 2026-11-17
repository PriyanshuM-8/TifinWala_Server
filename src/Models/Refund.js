import mongoose from "mongoose";

const refundSchema = new mongoose.Schema(
  {
    refundNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: [1, "Refund amount must be at least 1 paisa"],
    },
    gatewayRefundId: {
      type: String,
      sparse: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    refundType: {
      type: String,
      enum: [
        "instant_order_cancellation",
        "subscription_cancellation",
        "order_dispute",
        "payment_failure",
      ],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "processed", "failed"],
      default: "pending",
      index: true,
    },
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

refundSchema.virtual("amount").get(function () {
  return Number(((this.amountPaise || 0) / 100).toFixed(2));
});

const Refund = mongoose.models.Refund || mongoose.model("Refund", refundSchema);

export default Refund;
