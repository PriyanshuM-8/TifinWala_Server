import mongoose from "mongoose";

const rewardCouponSchema = new mongoose.Schema(
  {
    couponCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    pointsCost: {
      type: Number,
      default: 100,
    },
    unitsCost: {
      type: Number,
      default: 300,
    },
    status: {
      type: String,
      enum: ["active", "locked_in_redemption", "redeemed", "expired"],
      default: "active",
      index: true,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    redeemedAt: {
      type: Date,
    },
    notified7Days: {
      type: Boolean,
      default: false,
    },
    notified1Day: {
      type: Boolean,
      default: false,
    },
    redemptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardRedemption",
    },
  },
  {
    timestamps: true,
  }
);

rewardCouponSchema.index({ customerId: 1, status: 1 });
rewardCouponSchema.index({ status: 1, expiresAt: 1 });

const RewardCoupon = mongoose.model("RewardCoupon", rewardCouponSchema);

export default RewardCoupon;
