import mongoose from "mongoose";

const foodDetailItemSchema = new mongoose.Schema(
  {
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
    },
    foodName: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPricePaise: {
      type: Number,
      required: true,
      min: 0,
    },
    itemTotalPaise: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const chefEarningSchema = new mongoose.Schema(
  {
    earningNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sourceType: {
      type: String,
      enum: [
        "instant_order",
        "subscription_meal",
        "reward_redemption",
        "admin_adjustment",
      ],
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      index: true,
    },
    subscriptionMealOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionMealOrder",
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
    },
    redemptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardRedemption",
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      trim: true,
    },
    grossAmountPaise: {
      type: Number,
      required: true,
      min: [0, "Gross amount cannot be negative"],
    },
    netEarningsPaise: {
      type: Number,
      required: true,
      min: [0, "Net earnings cannot be negative"],
    },
    commissionDeductedPaise: {
      type: Number,
      default: 0,
      min: [0, "Commission cannot be negative"],
    },
    status: {
      type: String,
      enum: ["pending", "available", "settled", "reversed", "cash_settled"],
      default: "pending",
      index: true,
    },
    foodDetails: {
      type: [foodDetailItemSchema],
      default: [],
    },
    earningDateKey: {
      type: String,
      match: [/^\d{4}-\d{2}-\d{2}$/, "earningDateKey must be in YYYY-MM-DD format"],
      index: true,
    },
    availableAt: {
      type: Date,
    },
    settledAt: {
      type: Date,
    },
    reversedAt: {
      type: Date,
    },
    reversalReason: {
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

chefEarningSchema.virtual("grossAmount").get(function () {
  return Number(((this.grossAmountPaise || 0) / 100).toFixed(2));
});

chefEarningSchema.virtual("netEarnings").get(function () {
  return Number(((this.netEarningsPaise || 0) / 100).toFixed(2));
});

chefEarningSchema.virtual("commissionDeducted").get(function () {
  return Number(((this.commissionDeductedPaise || 0) / 100).toFixed(2));
});

chefEarningSchema.index({ chefId: 1, status: 1, createdAt: -1 });
chefEarningSchema.index({ chefId: 1, earningDateKey: 1 });

const ChefEarning =
  mongoose.models.ChefEarning || mongoose.model("ChefEarning", chefEarningSchema);

export default ChefEarning;
