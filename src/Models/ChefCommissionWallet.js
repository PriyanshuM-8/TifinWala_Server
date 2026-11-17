import mongoose from "mongoose";

const chefCommissionWalletSchema = new mongoose.Schema(
  {
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    // Total balance in integer paise = availableBalancePaise + reservedBalancePaise
    balancePaise: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Commission wallet balance cannot be negative"],
    },
    // Free balance available for accepting new orders (must be >= max(₹50, estimatedCommission))
    availableBalancePaise: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Available commission balance cannot be negative"],
    },
    // Amount locked for accepted in-flight orders waiting for delivery
    reservedBalancePaise: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Reserved commission balance cannot be negative"],
    },
    totalCommissionPaidPaise: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Total commission paid cannot be negative"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

chefCommissionWalletSchema.virtual("balance").get(function () {
  return Number(((this.balancePaise || 0) / 100).toFixed(2));
});

chefCommissionWalletSchema.virtual("availableBalance").get(function () {
  return Number(((this.availableBalancePaise || 0) / 100).toFixed(2));
});

chefCommissionWalletSchema.virtual("reservedBalance").get(function () {
  return Number(((this.reservedBalancePaise || 0) / 100).toFixed(2));
});

chefCommissionWalletSchema.virtual("totalCommissionPaid").get(function () {
  return Number(((this.totalCommissionPaidPaise || 0) / 100).toFixed(2));
});

const ChefCommissionWallet =
  mongoose.models.ChefCommissionWallet ||
  mongoose.model("ChefCommissionWallet", chefCommissionWalletSchema);

export default ChefCommissionWallet;
