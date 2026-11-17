import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderType: {
      type: String,
      enum: ["instant_order", "subscription", "commission_recharge"],
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
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    paymentProvider: {
      type: String,
      enum: ["razorpay", "cod", "internal_reward"],
      default: "razorpay",
    },
    paymentMethod: {
      type: String,
      enum: ["online", "cod", "reward_redemption"],
      default: "online",
    },
    razorpayOrderId: {
      type: String,
      sparse: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      sparse: true,
      index: true,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    currency: {
      type: String,
      default: "INR",
    },
    // Base amount before discount or COD fee (e.g., 50000 paise for ₹500 food)
    baseAmountPaise: {
      type: Number,
      required: true,
      min: [0, "Base amount cannot be negative"],
    },
    // Platform-funded discount (e.g., 2000 paise = ₹20 for online payments)
    onlineDiscountPaise: {
      type: Number,
      default: 0,
      min: [0, "Online discount cannot be negative"],
    },
    // COD fee (e.g., 2000 paise = ₹20 for Cash on Delivery)
    codFeePaise: {
      type: Number,
      default: 0,
      min: [0, "COD fee cannot be negative"],
    },
    // Amount collected from customer (e.g. 48000 paise for ₹480 online payment, or 52000 paise for ₹520 COD)
    payableAmountPaise: {
      type: Number,
      required: true,
      min: [0, "Payable amount cannot be negative"],
    },
    // Amount funded by platform (e.g., 2000 paise for online discount)
    platformSubsidyPaise: {
      type: Number,
      default: 0,
      min: [0, "Platform subsidy cannot be negative"],
    },
    status: {
      type: String,
      enum: [
        "created",
        "authorized",
        "captured",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      default: "created",
      index: true,
    },
    capturedAt: {
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
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

paymentSchema.virtual("baseAmount").get(function () {
  return Number(((this.baseAmountPaise || 0) / 100).toFixed(2));
});

paymentSchema.virtual("onlineDiscount").get(function () {
  return Number(((this.onlineDiscountPaise || 0) / 100).toFixed(2));
});

paymentSchema.virtual("codFee").get(function () {
  return Number(((this.codFeePaise || 0) / 100).toFixed(2));
});

paymentSchema.virtual("payableAmount").get(function () {
  return Number(((this.payableAmountPaise || 0) / 100).toFixed(2));
});

paymentSchema.virtual("platformSubsidy").get(function () {
  return Number(((this.platformSubsidyPaise || 0) / 100).toFixed(2));
});

const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);

export default Payment;
