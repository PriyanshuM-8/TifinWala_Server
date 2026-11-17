import mongoose from "mongoose";

const customerLoyaltyAccountSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    // Exact internal units: 1 Loyalty Point = 3 Units. 15 Units = 5.0000 Points.
    balanceUnits: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Balance units cannot be negative"],
    },
    lifetimeEarnedUnits: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Lifetime earned units cannot be negative"],
    },
    lifetimeRedeemedUnits: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Lifetime redeemed units cannot be negative"],
    },
    lastActiveDateKey: {
      type: String,
      match: [/^\d{4}-\d{2}-\d{2}$/, "lastActiveDateKey must be in YYYY-MM-DD format"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual properties to display decimal points formatted to 4 decimals
customerLoyaltyAccountSchema.virtual("pointsBalance").get(function () {
  return Number(((this.balanceUnits || 0) / 3).toFixed(4));
});

customerLoyaltyAccountSchema.virtual("lifetimeEarnedPoints").get(function () {
  return Number(((this.lifetimeEarnedUnits || 0) / 3).toFixed(4));
});

customerLoyaltyAccountSchema.virtual("lifetimeRedeemedPoints").get(function () {
  return Number(((this.lifetimeRedeemedUnits || 0) / 3).toFixed(4));
});

const CustomerLoyaltyAccount = mongoose.model(
  "CustomerLoyaltyAccount",
  customerLoyaltyAccountSchema
);

export default CustomerLoyaltyAccount;
