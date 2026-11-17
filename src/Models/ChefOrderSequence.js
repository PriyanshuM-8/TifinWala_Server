import mongoose from "mongoose";

const chefOrderSequenceSchema = new mongoose.Schema(
  {
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    acceptedOrderCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    // Consumed immediately on acceptance of the chef's first eligible order.
    // Never restored even if that order is cancelled or rejected.
    hasUsedFirstOrderFreeBenefit: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    firstOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    firstOrderAcceptedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const ChefOrderSequence =
  mongoose.models.ChefOrderSequence ||
  mongoose.model("ChefOrderSequence", chefOrderSequenceSchema);

export default ChefOrderSequence;
