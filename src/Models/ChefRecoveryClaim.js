import mongoose from "mongoose";

const chefRecoveryClaimSchema = new mongoose.Schema(
  {
    claimNumber: {
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
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    claimedAmountPaise: {
      type: Number,
      required: true,
      min: [1, "Claimed amount must be at least 1 paisa"],
    },
    recoveredAmountPaise: {
      type: Number,
      default: 0,
      min: [0, "Recovered amount cannot be negative"],
    },
    remainingAmountPaise: {
      type: Number,
      required: true,
      min: [0, "Remaining amount cannot be negative"],
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "partially_recovered", "fully_recovered", "written_off"],
      default: "pending",
      index: true,
    },
    settledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

chefRecoveryClaimSchema.virtual("claimedAmount").get(function () {
  return Number(((this.claimedAmountPaise || 0) / 100).toFixed(2));
});

chefRecoveryClaimSchema.virtual("recoveredAmount").get(function () {
  return Number(((this.recoveredAmountPaise || 0) / 100).toFixed(2));
});

chefRecoveryClaimSchema.virtual("remainingAmount").get(function () {
  return Number(((this.remainingAmountPaise || 0) / 100).toFixed(2));
});

const ChefRecoveryClaim =
  mongoose.models.ChefRecoveryClaim ||
  mongoose.model("ChefRecoveryClaim", chefRecoveryClaimSchema);

export default ChefRecoveryClaim;
