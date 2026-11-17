import mongoose from "mongoose";

const platformConfigSchema = new mongoose.Schema(
  {
    configKey: {
      type: String,
      default: "global_platform_config",
      unique: true,
      required: true,
    },
    onlineDiscountRupees: {
      type: Number,
      default: 20,
      min: [0, "Online discount cannot be negative"],
    },
    codFeeRupees: {
      type: Number,
      default: 20,
      min: [0, "COD fee cannot be negative"],
    },
    standardCommissionRate: {
      type: Number,
      default: 0.1, // 10%
      min: [0, "Commission rate cannot be negative"],
      max: [1, "Commission rate cannot exceed 100%"],
    },
    minimumCommissionWalletBalanceRupees: {
      type: Number,
      default: 50, // ₹50
      min: [0, "Minimum commission wallet balance cannot be negative"],
    },
    minimumWithdrawalRupees: {
      type: Number,
      default: 100, // ₹100
      min: [1, "Minimum withdrawal must be at least ₹1"],
    },
    minimumRechargeRupees: {
      type: Number,
      default: 100, // ₹100
      min: [1, "Minimum recharge must be at least ₹1"],
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    couponExpiryDays: {
      type: Number,
      default: 30,
      min: [1, "Coupon expiry days must be at least 1"],
    },
    version: {
      type: Number,
      default: 1,
      min: [1, "Version must be at least 1"],
    },
    changeHistory: [
      {
        version: { type: Number, required: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        changes: { type: mongoose.Schema.Types.Mixed, required: true },
        reason: { type: String, required: true, trim: true },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

platformConfigSchema.virtual("onlineDiscountPaise").get(function () {
  return Math.round((this.onlineDiscountRupees || 0) * 100);
});

platformConfigSchema.virtual("codFeePaise").get(function () {
  return Math.round((this.codFeeRupees || 0) * 100);
});

platformConfigSchema.virtual("minimumCommissionWalletBalancePaise").get(function () {
  return Math.round((this.minimumCommissionWalletBalanceRupees || 0) * 100);
});

platformConfigSchema.virtual("minimumWithdrawalPaise").get(function () {
  return Math.round((this.minimumWithdrawalRupees || 0) * 100);
});

platformConfigSchema.virtual("minimumRechargePaise").get(function () {
  return Math.round((this.minimumRechargeRupees || 0) * 100);
});

const PlatformConfig =
  mongoose.models.PlatformConfig ||
  mongoose.model("PlatformConfig", platformConfigSchema);

export default PlatformConfig;
