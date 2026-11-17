import mongoose from "mongoose";

const mealPlanConfigSchema = new mongoose.Schema(
  {
    mealType: {
      type: String,
      enum: ["breakfast", "lunch", "dinner"],
      required: true,
    },
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
    },
    deliveryType: {
      type: String,
      enum: ["chef_delivery", "customer_pickup"],
      required: true,
    },
    deliveryAddressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerAddress",
      default: null,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, "Unit price cannot be negative"],
    },
    mealDailyTotal: {
      type: Number,
      required: true,
      min: [0, "Meal daily total cannot be negative"],
    },
  },
  { _id: false }
);

const subscriptionSchema = new mongoose.Schema(
  {
    subscriptionNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Customer ID is required"],
      index: true,
    },
    startDateKey: {
      type: String,
      required: [true, "Start date key (YYYY-MM-DD) is required"],
      match: [/^\d{4}-\d{2}-\d{2}$/, "Start date key must be in YYYY-MM-DD format"],
      index: true,
    },
    endDateKey: {
      type: String,
      required: [true, "End date key (YYYY-MM-DD) is required"],
      match: [/^\d{4}-\d{2}-\d{2}$/, "End date key must be in YYYY-MM-DD format"],
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    durationDays: {
      type: Number,
      required: [true, "Duration in days is required"],
      min: [1, "Duration must be at least 1 day"],
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    mealTypes: {
      type: [String],
      enum: ["breakfast", "lunch", "dinner"],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 3,
        message: "Subscription must configure between 1 and 3 meal types.",
      },
    },
    mealConfigurations: {
      type: [mealPlanConfigSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1,
        message: "At least one meal configuration is required.",
      },
    },
    dailySubtotal: {
      type: Number,
      required: true,
      min: [0, "Daily subtotal cannot be negative"],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0, "Total amount cannot be negative"],
    },
    // Phase 10: Financial integer paise fields
    totalAmountPaise: {
      type: Number,
      default: 0,
      min: [0, "Total amount in paise cannot be negative"],
    },
    onlineDiscountPaise: {
      type: Number,
      default: 0,
      min: [0, "Online discount in paise cannot be negative"],
    },
    deliveredMealsCount: {
      type: Number,
      default: 0,
    },
    refundedAmountPaise: {
      type: Number,
      default: 0,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      index: true,
    },
    subscriptionStatus: {
      type: String,
      enum: ["pending_payment", "active", "completed", "cancelled"],
      default: "pending_payment",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancellationReason: {
      type: String,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      maxlength: 500,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Synchronize monetary integer paise fields with Rupee float fields
subscriptionSchema.pre("save", function () {
  if (this.isModified("totalAmount") || !this.totalAmountPaise) {
    this.totalAmountPaise = Math.round((this.totalAmount || 0) * 100);
  }
});

subscriptionSchema.index({ customerId: 1, subscriptionStatus: 1, createdAt: -1 });

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);

export default Subscription;
