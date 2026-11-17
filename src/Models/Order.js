import mongoose from "mongoose";

const orderItemSnapshotSchema = new mongoose.Schema(
  {
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: true,
    },
    foodName: {
      type: String,
      required: true,
      trim: true,
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
      min: [1, "Quantity must be at least 1"],
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, "Unit price cannot be negative"],
    },
    itemTotal: {
      type: Number,
      required: true,
      min: [0, "Item total cannot be negative"],
    },
  },
  { _id: false }
);

const deliveryAddressSnapshotSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    addressType: { type: String, default: "home" },
    addressLine: { type: String, required: true },
    landmark: { type: String, default: "" },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: [Number],
    },
  },
  { _id: false }
);

const pickupInformationSchema = new mongoose.Schema(
  {
    kitchenName: { type: String, required: true },
    ownerName: { type: String, default: "" },
    city: { type: String, required: true },
    pickupInstructions: { type: String, default: "" },
    kitchenAddress: { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
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
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Chef ID is required"],
      index: true,
    },
    items: {
      type: [orderItemSnapshotSchema],
      required: true,
      validate: {
        validator: function (items) {
          return Array.isArray(items) && items.length > 0;
        },
        message: "Order must contain at least one item.",
      },
    },
    deliveryType: {
      type: String,
      enum: {
        values: ["chef_delivery", "customer_pickup"],
        message: "{VALUE} is not a valid delivery type (allowed: chef_delivery, customer_pickup)",
      },
      required: [true, "Delivery type is required"],
    },
    deliveryAddressSnapshot: {
      type: deliveryAddressSnapshotSchema,
      required: function () {
        return this.deliveryType === "chef_delivery";
      },
    },
    pickupInformation: {
      type: pickupInformationSchema,
    },
    subtotal: {
      type: Number,
      required: true,
      min: [0, "Subtotal cannot be negative"],
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: [0, "Delivery fee cannot be negative"],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0, "Total amount cannot be negative"],
    },
    // Phase 10: Financial integer paise fields
    subtotalPaise: {
      type: Number,
      default: 0,
      min: [0, "Subtotal in paise cannot be negative"],
    },
    deliveryFeePaise: {
      type: Number,
      default: 0,
      min: [0, "Delivery fee in paise cannot be negative"],
    },
    onlineDiscountPaise: {
      type: Number,
      default: 0,
      min: [0, "Online discount in paise cannot be negative"],
    },
    codFeePaise: {
      type: Number,
      default: 0,
      min: [0, "COD fee in paise cannot be negative"],
    },
    totalAmountPaise: {
      type: Number,
      default: 0,
      min: [0, "Total amount in paise cannot be negative"],
    },
    codAmountDuePaise: {
      type: Number,
      default: 0,
      min: [0, "COD amount due in paise cannot be negative"],
    },
    paymentMethod: {
      type: String,
      enum: ["online", "cod", null],
      default: null,
      index: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      index: true,
    },
    settlementStatus: {
      type: String,
      enum: ["unsettled", "settled", "disputed", "refunded"],
      default: "unsettled",
      index: true,
    },
    settledAt: {
      type: Date,
      default: null,
    },
    orderStatus: {
      type: String,
      enum: {
        values: [
          "pending_confirmation",
          "accepted",
          "preparing",
          "ready_for_pickup",
          "out_for_delivery",
          "delivered",
          "cancelled",
          "rejected",
        ],
        message: "{VALUE} is not a valid order status",
      },
      default: "pending_confirmation",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    clientRequestId: {
      type: String,
      index: true,
      sparse: true,
    },
    cancellationReason: {
      type: String,
      default: null,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    chefRejectionReason: {
      type: String,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    stockRestored: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Synchronize monetary integer paise fields with Rupee float fields
orderSchema.pre("save", function () {
  if (this.isModified("subtotal") || !this.subtotalPaise) {
    this.subtotalPaise = Math.round((this.subtotal || 0) * 100);
  }
  if (this.isModified("deliveryFee") || (!this.deliveryFeePaise && this.deliveryFee)) {
    this.deliveryFeePaise = Math.round((this.deliveryFee || 0) * 100);
  }
  if (this.isModified("totalAmount") || !this.totalAmountPaise) {
    this.totalAmountPaise = Math.round((this.totalAmount || 0) * 100);
  }
  if (this.paymentMethod === "cod" && !this.codAmountDuePaise) {
    this.codAmountDuePaise = this.totalAmountPaise;
  }
});

// Helpful compound indexes
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ chefId: 1, orderStatus: 1, createdAt: -1 });

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

export default Order;
