import mongoose from "mongoose";

const loyaltyTransactionSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: ["credit", "debit", "adjustment"],
      required: true,
    },
    source: {
      type: String,
      enum: [
        "meal_completion",
        "coupon_redemption",
        "coupon_expiry_refund",
        "admin_adjustment",
      ],
      required: true,
    },
    // Absolute magnitude of units moved (e.g. 15 units = 5.0000 points)
    units: {
      type: Number,
      required: true,
      min: [1, "Units must be at least 1"],
    },
    points: {
      type: Number,
      required: true,
    },
    balanceAfterUnits: {
      type: Number,
      required: true,
    },
    balanceAfterPoints: {
      type: Number,
      required: true,
    },
    scheduledDateKey: {
      type: String,
      match: [/^\d{4}-\d{2}-\d{2}$/, "scheduledDateKey must be in YYYY-MM-DD format"],
      index: true,
    },
    mealOrderIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubscriptionMealOrder",
      },
    ],
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardCoupon",
      index: true,
    },
    adminUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    auditReason: {
      type: String,
      trim: true,
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
  }
);

loyaltyTransactionSchema.index({ customerId: 1, createdAt: -1 });

const LoyaltyTransaction = mongoose.model(
  "LoyaltyTransaction",
  loyaltyTransactionSchema
);

export default LoyaltyTransaction;
