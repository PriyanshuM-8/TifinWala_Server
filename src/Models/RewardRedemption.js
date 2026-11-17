import mongoose from "mongoose";

const rewardMealItemSchema = new mongoose.Schema(
  {
    mealType: {
      type: String,
      enum: ["breakfast", "lunch", "dinner"],
      required: true,
    },
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: true,
    },
    foodName: {
      type: String,
      required: true,
    },
    portionSize: {
      type: String,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "preparing",
        "ready_for_pickup",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    deliveredAt: {
      type: Date,
    },
  },
  { _id: true }
);

const rewardRedemptionSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardCoupon",
      required: true,
      unique: true,
      index: true,
    },
    couponCode: {
      type: String,
      required: true,
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
      required: true,
      index: true,
    },
    redemptionDateKey: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "redemptionDateKey must be in YYYY-MM-DD format"],
      index: true,
    },
    deliveryType: {
      type: String,
      enum: ["delivery", "customer_pickup"],
      default: "delivery",
    },
    deliveryAddress: {
      addressLine: { type: String },
      city: { type: String },
      state: { type: String },
      postalCode: { type: String },
      landmark: { type: String },
      contactPhone: { type: String },
      location: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: {
          type: [Number], // [lng, lat]
        },
      },
    },
    meals: {
      type: [rewardMealItemSchema],
      validate: {
        validator: function (v) {
          if (!Array.isArray(v) || v.length !== 3) return false;
          const types = v.map((m) => m.mealType).sort();
          return types[0] === "breakfast" && types[1] === "dinner" && types[2] === "lunch";
        },
        message: "Reward redemption must contain exactly one breakfast, one lunch, and one dinner.",
      },
    },
    status: {
      type: String,
      enum: ["in_progress", "completed", "cancelled"],
      default: "in_progress",
      index: true,
    },
    completedAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

rewardRedemptionSchema.index({ customerId: 1, status: 1 });
rewardRedemptionSchema.index({ chefId: 1, redemptionDateKey: 1 });

const RewardRedemption = mongoose.model("RewardRedemption", rewardRedemptionSchema);

export default RewardRedemption;
