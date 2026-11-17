import mongoose from "mongoose";

const rejectionRecordSchema = new mongoose.Schema(
  {
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: true,
    },
    foodName: {
      type: String,
      required: true,
    },
    rejectionReason: {
      type: String,
      required: true,
    },
    rejectedAt: {
      type: Date,
      default: Date.now,
    },
    stockRestored: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const reassignmentRecordSchema = new mongoose.Schema(
  {
    previousChefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    previousFoodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: true,
    },
    newChefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    newFoodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    changeReason: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const subscriptionMealOrderSchema = new mongoose.Schema(
  {
    mealOrderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    scheduledDateKey: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "scheduledDateKey must be in YYYY-MM-DD format"],
      index: true,
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    mealType: {
      type: String,
      enum: ["breakfast", "lunch", "dinner"],
      required: true,
      index: true,
    },
    foodItem: {
      foodId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Food",
        required: true,
      },
      foodName: {
        type: String,
        required: true,
      },
      foodImage: {
        type: String,
        default: "",
      },
      foodType: {
        type: String,
        enum: ["veg", "non_veg"],
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
      unitPrice: {
        type: Number,
        required: true,
        min: 0,
      },
      itemTotal: {
        type: Number,
        required: true,
        min: 0,
      },
    },
    deliveryType: {
      type: String,
      enum: ["chef_delivery", "customer_pickup"],
      required: true,
    },
    deliveryAddressSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    pickupInformationSnapshot: {
      kitchenName: { type: String, default: "" },
      city: { type: String, default: "" },
    },
    orderStatus: {
      type: String,
      enum: [
        "scheduled",
        "accepted",
        "preparing",
        "ready_for_pickup",
        "out_for_delivery",
        "delivered",
        "skipped",
        "cancelled",
        "rejected",
        "expired",
      ],
      default: "scheduled",
      index: true,
    },
    isSkipped: {
      type: Boolean,
      default: false,
      index: true,
    },
    skippedAt: {
      type: Date,
      default: null,
    },
    skipReason: {
      type: String,
      default: null,
    },
    isStockReserved: {
      type: Boolean,
      default: false,
      index: true,
    },
    stockRestored: {
      type: Boolean,
      default: false,
      index: true,
    },
    reservationWindowOpensAt: {
      type: Date,
      required: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    preparingAt: {
      type: Date,
      default: null,
    },
    readyForPickupAt: {
      type: Date,
      default: null,
    },
    outForDeliveryAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    rejectionHistory: {
      type: [rejectionRecordSchema],
      default: [],
    },
    reassignmentHistory: {
      type: [reassignmentRecordSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique constraint to ensure no duplicate meal is created for the same subscription, date, and meal type
subscriptionMealOrderSchema.index(
  { subscriptionId: 1, scheduledDateKey: 1, mealType: 1 },
  { unique: true }
);

subscriptionMealOrderSchema.index({ chefId: 1, scheduledDateKey: 1, orderStatus: 1 });
subscriptionMealOrderSchema.index({ customerId: 1, scheduledDateKey: 1, orderStatus: 1 });

const SubscriptionMealOrder =
  mongoose.models.SubscriptionMealOrder ||
  mongoose.model("SubscriptionMealOrder", subscriptionMealOrderSchema);

export default SubscriptionMealOrder;
