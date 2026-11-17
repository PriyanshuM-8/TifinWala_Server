import mongoose from "mongoose";

const chefWalletSchema = new mongoose.Schema(
  {
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    // All financial balances are stored in integer paise (₹1.00 = 100 paise)
    pendingBalancePaise: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Pending balance cannot be negative"],
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
    totalEarnedPaise: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Total earned cannot be negative"],
    },
    // Locked balance for in-flight payout withdrawals
    reservedWithdrawalBalancePaise: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Reserved withdrawal balance cannot be negative"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtuals to expose human-friendly Rupee decimals
chefWalletSchema.virtual("pendingBalance").get(function () {
  return Number(((this.pendingBalancePaise || 0) / 100).toFixed(2));
});

chefWalletSchema.virtual("availableBalance").get(function () {
  return Number(((this.availableBalancePaise || 0) / 100).toFixed(2));
});

chefWalletSchema.virtual("reservedWithdrawalBalance").get(function () {
  return Number(((this.reservedWithdrawalBalancePaise || 0) / 100).toFixed(2));
});

chefWalletSchema.virtual("settledBalance").get(function () {
  return Number(((this.settledBalancePaise || 0) / 100).toFixed(2));
});

chefWalletSchema.virtual("totalEarned").get(function () {
  return Number(((this.totalEarnedPaise || 0) / 100).toFixed(2));
});

const ChefWallet = mongoose.models.ChefWallet || mongoose.model("ChefWallet", chefWalletSchema);

export default ChefWallet;
