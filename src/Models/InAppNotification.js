import mongoose from "mongoose";

const inAppNotificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recipientRole: {
      type: String,
      enum: ["customer", "chef", "admin"],
      default: "customer",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "loyalty_earned",
        "coupon_generated",
        "coupon_expiring_soon",
        "coupon_expired",
        "redemption_update",
        "admin_points_adjustment",
        "order_placed",
        "order_accepted",
        "order_rejected",
        "order_preparing",
        "order_ready_for_pickup",
        "order_out_for_delivery",
        "order_delivered",
        "order_cancelled",
      ],
      required: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

inAppNotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

const InAppNotification = mongoose.model(
  "InAppNotification",
  inAppNotificationSchema
);

export default InAppNotification;
