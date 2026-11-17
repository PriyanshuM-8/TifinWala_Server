import mongoose from "mongoose";

const walletWithdrawalSchema = new mongoose.Schema(
  {
    withdrawalNumber: {
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
    amountPaise: {
      type: Number,
      required: true,
      min: [100, "Minimum withdrawal is 100 paise (₹1.00)"],
    },
    status: {
      type: String,
      enum: ["requested", "approved", "processing", "completed", "paid", "rejected"],
      default: "requested",
      index: true,
    },
    payoutMethod: {
      type: String,
      enum: ["bank_transfer", "upi"],
      required: true,
    },
    payoutDetails: {
      accountNumber: String,
      ifscCode: String,
      accountHolderName: String,
      upiId: String,
    },
    encryptedPayoutDetails: {
      type: String,
      default: null,
    },
    maskedPayoutDetails: {
      type: Object,
      default: {},
    },
    utrNumber: {
      type: String,
      trim: true,
      default: null,
    },
    referenceId: {
      type: String,
      trim: true,
      default: null,
    },
    adminNote: {
      type: String,
      trim: true,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    settledAt: Date,
    rejectedReason: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

walletWithdrawalSchema.virtual("amount").get(function () {
  return Number(((this.amountPaise || 0) / 100).toFixed(2));
});

const WalletWithdrawal =
  mongoose.models.WalletWithdrawal ||
  mongoose.model("WalletWithdrawal", walletWithdrawalSchema);

export default WalletWithdrawal;
