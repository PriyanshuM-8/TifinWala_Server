import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Admin ID is required for audit logging"],
      index: true,
    },
    actionType: {
      type: String,
      required: [true, "Action type is required"],
      enum: {
        values: [
          "customer_status_change",
          "chef_approval",
          "chef_rejection",
          "chef_status_change",
          "food_moderation",
          "category_status_change",
          "review_moderation",
          "complaint_resolution",
          "withdrawal_approval",
          "withdrawal_rejection",
          "withdrawal_payout",
          "order_cancellation",
          "order_dispute_refund",
          "platform_config_update",
          "loyalty_point_adjustment",
          "chef_wallet_adjustment",
          "admin_bank_account_added",
          "admin_bank_account_verified",
          "admin_bank_account_default_set",
          "admin_bank_account_removed",
          "admin_withdrawal_requested",
          "admin_withdrawal_settled",
          "admin_withdrawal_failed",
          "admin_withdrawal_cancelled",
        ],
        message: "{VALUE} is not a recognized audit action type",
      },
      index: true,
    },
    targetEntityType: {
      type: String,
      required: [true, "Target entity type is required"],
      enum: {
        values: [
          "User",
          "ChefProfile",
          "Food",
          "Category",
          "Review",
          "Complaint",
          "Order",
          "Subscription",
          "WalletWithdrawal",
          "Refund",
          "PlatformConfig",
          "CustomerLoyaltyAccount",
          "ChefWallet",
          "AdminBankAccount",
          "AdminWithdrawal",
        ],
        message: "{VALUE} is not a valid target entity type",
      },
      index: true,
    },
    targetEntityId: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, "Target entity ID is required"],
      index: true,
    },
    previousState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    reason: {
      type: String,
      required: [true, "Audit reason is mandatory"],
      trim: true,
      minlength: [3, "Audit reason must be at least 3 characters"],
      maxlength: [1000, "Audit reason cannot exceed 1000 characters"],
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable: no updatedAt field
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Mongoose-level enforcement of append-only immutability
auditLogSchema.pre(
  [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
    "findOneAndRemove",
    "replaceOne",
  ],
  function () {
    throw new Error(
      "AuditLog is an append-only collection. Updates and deletions are strictly prohibited."
    );
  }
);

auditLogSchema.pre("save", function () {
  if (!this.isNew) {
    throw new Error("AuditLog records are immutable and cannot be updated once created.");
  }
});

// Compound indexes for rapid administrative querying
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actionType: 1, createdAt: -1 });
auditLogSchema.index({ targetEntityType: 1, targetEntityId: 1, createdAt: -1 });
auditLogSchema.index({ adminId: 1, createdAt: -1 });

const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
