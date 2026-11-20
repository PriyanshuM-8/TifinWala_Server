import mongoose from "mongoose";

const adminWithdrawalSchema = new mongoose.Schema(
  {
    withdrawalNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminBankAccount",
      required: true,
    },
    bankSnapshot: {
      accountHolderName: { type: String, required: true },
      bankName: { type: String, required: true },
      maskedAccountNumber: { type: String, required: true },
      maskedIfscCode: { type: String, required: true },
      accountType: { type: String, default: "current" },
    },
    amountPaise: {
      type: Number,
      required: true,
      min: [10000, "Minimum withdrawal is ₹100.00 (10000 paise)"],
    },
    payoutFeePaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    netTransferPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "successful", "failed", "reversed", "cancelled"],
      default: "pending",
      index: true,
    },
    payoutProvider: {
      type: String,
      enum: ["razorpayx", "manual_bank_transfer", "mock_payout"],
      default: "razorpayx",
    },
    providerPayoutId: {
      type: String,
      default: null,
      index: true,
    },
    providerStatus: {
      type: String,
      default: null,
    },
    utrNumber: {
      type: String,
      default: null,
      trim: true,
    },
    failureReason: {
      type: String,
      default: null,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

adminWithdrawalSchema.virtual("amountRupees").get(function () {
  return Number(((this.amountPaise || 0) / 100).toFixed(2));
});

adminWithdrawalSchema.virtual("netTransferRupees").get(function () {
  return Number(((this.netTransferPaise || 0) / 100).toFixed(2));
});

adminWithdrawalSchema.virtual("payoutFeeRupees").get(function () {
  return Number(((this.payoutFeePaise || 0) / 100).toFixed(2));
});

adminWithdrawalSchema.index({ createdAt: -1 });

const AdminWithdrawal =
  mongoose.models.AdminWithdrawal ||
  mongoose.model("AdminWithdrawal", adminWithdrawalSchema);

export default AdminWithdrawal;
