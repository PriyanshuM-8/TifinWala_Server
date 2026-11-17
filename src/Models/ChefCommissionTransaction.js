import mongoose from "mongoose";

const chefCommissionTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: {
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
    commissionWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChefCommissionWallet",
      required: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: [
        "recharge_credit",
        "commission_reserve",
        "commission_capture",
        "commission_release",
        "cod_fee_reserve",
        "cod_fee_capture",
        "cod_fee_release",
        "admin_credit",
        "admin_debit",
        "refund_credit",
      ],
      required: true,
      index: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
    },
    availableBalanceAfterPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    reservedBalanceAfterPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    totalBalanceAfterPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    subscriptionMealOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionMealOrder",
    },
    description: {
      type: String,
      required: true,
      trim: true,
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

chefCommissionTransactionSchema.virtual("amount").get(function () {
  return Number(((this.amountPaise || 0) / 100).toFixed(2));
});

chefCommissionTransactionSchema.virtual("availableBalanceAfter").get(function () {
  return Number(((this.availableBalanceAfterPaise || 0) / 100).toFixed(2));
});

chefCommissionTransactionSchema.virtual("totalBalanceAfter").get(function () {
  return Number(((this.totalBalanceAfterPaise || 0) / 100).toFixed(2));
});

chefCommissionTransactionSchema.index({ chefId: 1, createdAt: -1 });

const ChefCommissionTransaction =
  mongoose.models.ChefCommissionTransaction ||
  mongoose.model("ChefCommissionTransaction", chefCommissionTransactionSchema);

export default ChefCommissionTransaction;
