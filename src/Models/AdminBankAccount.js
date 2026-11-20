import mongoose from "mongoose";

const adminBankAccountSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accountHolderName: {
      type: String,
      required: [true, "Account holder name is required"],
      trim: true,
    },
    bankName: {
      type: String,
      required: [true, "Bank name is required"],
      trim: true,
    },
    // AES-256-GCM encrypted account number & IFSC
    encryptedAccountNumber: {
      type: String,
      required: true,
    },
    maskedAccountNumber: {
      type: String,
      required: true, // e.g. "••••••••1234"
    },
    encryptedIfscCode: {
      type: String,
      required: true,
    },
    maskedIfscCode: {
      type: String,
      required: true, // e.g. "HDFC••••234"
    },
    accountType: {
      type: String,
      enum: ["current", "savings"],
      default: "current",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verificationMethod: {
      type: String,
      enum: ["penny_drop", "manual_otp", "admin_verified", "pending"],
      default: "pending",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    razorpayContactId: {
      type: String,
      default: null,
    },
    razorpayFundAccountId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

adminBankAccountSchema.index({ adminId: 1, isDefault: 1 });
adminBankAccountSchema.index({ adminId: 1, isActive: 1 });

const AdminBankAccount =
  mongoose.models.AdminBankAccount ||
  mongoose.model("AdminBankAccount", adminBankAccountSchema);

export default AdminBankAccount;
