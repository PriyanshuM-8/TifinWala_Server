import mongoose from "mongoose";

const complaintSchema = new mongoose.Schema(
  {
    complaintNumber: {
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
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null, // Nullable for general application or account complaints
      index: true,
    },
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    category: {
      type: String,
      enum: {
        values: [
          "food_quality",
          "delivery_delay",
          "missing_item",
          "billing",
          "chef_behavior",
          "hygiene",
          "app_issue",
          "other",
        ],
        message: "{VALUE} is not a recognized complaint category",
      },
      required: [true, "Complaint category is required"],
      index: true,
    },
    subject: {
      type: String,
      required: [true, "Complaint subject is required"],
      trim: true,
      minlength: [3, "Subject must be at least 3 characters long"],
      maxlength: [120, "Subject cannot exceed 120 characters"],
    },
    description: {
      type: String,
      required: [true, "Complaint description is required"],
      trim: true,
      minlength: [10, "Description must be at least 10 characters long"],
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    status: {
      type: String,
      enum: {
        values: ["open", "under_investigation", "resolved", "dismissed"],
        message: "{VALUE} is not a valid complaint status",
      },
      default: "open",
      index: true,
    },
    resolutionNotes: {
      type: String,
      trim: true,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
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

complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ customerId: 1, createdAt: -1 });
complaintSchema.index({ chefId: 1, status: 1 });
complaintSchema.index({ category: 1, status: 1 });

const Complaint = mongoose.models.Complaint || mongoose.model("Complaint", complaintSchema);

export default Complaint;
