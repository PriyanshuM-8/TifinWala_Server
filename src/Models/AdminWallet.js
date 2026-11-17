import mongoose from "mongoose";

const adminWalletSchema = new mongoose.Schema(
  {
    walletType: {
      type: String,
      default: "platform_commission",
      unique: true,
      required: true,
    },
    totalCommissionEarnedPaise: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Total commission earned cannot be negative"],
    },
    availableBalancePaise: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Available balance cannot be negative"],
    },
    settledBalancePaise: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Settled balance cannot be negative"],
    },
    totalCodFeeEarnedPaise: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Total COD fee earned cannot be negative"],
    },
    totalPromotionalDiscountExpensePaise: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Total promotional discount expense cannot be negative"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

adminWalletSchema.virtual("totalCommissionEarned").get(function () {
  return Number(((this.totalCommissionEarnedPaise || 0) / 100).toFixed(2));
});

adminWalletSchema.virtual("totalCodFeeEarned").get(function () {
  return Number(((this.totalCodFeeEarnedPaise || 0) / 100).toFixed(2));
});

adminWalletSchema.virtual("totalPromotionalDiscountExpense").get(function () {
  return Number(((this.totalPromotionalDiscountExpensePaise || 0) / 100).toFixed(2));
});

adminWalletSchema.virtual("availableBalance").get(function () {
  return Number(((this.availableBalancePaise || 0) / 100).toFixed(2));
});

adminWalletSchema.virtual("settledBalance").get(function () {
  return Number(((this.settledBalancePaise || 0) / 100).toFixed(2));
});

const AdminWallet =
  mongoose.models.AdminWallet || mongoose.model("AdminWallet", adminWalletSchema);

export default AdminWallet;
