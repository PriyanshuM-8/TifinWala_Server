import mongoose from "mongoose";

const adminWalletTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    adminWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminWallet",
      required: true,
    },
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    transactionType: {
      type: String,
      enum: [
        "commission_credit",
        "commission_reversal",
        "cod_fee_credit",
        "cod_fee_reversal",
        "promotional_discount_expense",
        "refund_debit",
        "admin_settlement",
        "admin_adjustment",
        "admin_withdrawal_reserve",
        "admin_withdrawal_capture",
        "admin_withdrawal_release",
        "admin_payout_fee",
      ],
      required: true,
      index: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
    },
    balanceAfterPaise: {
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
    adminWithdrawalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminWithdrawal",
      index: true,
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

adminWalletTransactionSchema.virtual("amount").get(function () {
  return Number(((this.amountPaise || 0) / 100).toFixed(2));
});

adminWalletTransactionSchema.virtual("balanceAfter").get(function () {
  return Number(((this.balanceAfterPaise || 0) / 100).toFixed(2));
});

adminWalletTransactionSchema.index({ createdAt: -1 });

const AdminWalletTransaction =
  mongoose.models.AdminWalletTransaction ||
  mongoose.model("AdminWalletTransaction", adminWalletTransactionSchema);

export default AdminWalletTransaction;
