import mongoose from "mongoose";

const chefProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Chef User ID is required"],
      unique: true,
      index: true,
    },
    kitchenName: {
      type: String,
      required: [true, "Kitchen name is required"],
      trim: true,
      minlength: [2, "Kitchen name must be at least 2 characters"],
      maxlength: [100, "Kitchen name cannot exceed 100 characters"],
    },
    ownerName: {
      type: String,
      required: [true, "Owner name is required"],
      trim: true,
    },
    kitchenAddress: {
      type: String,
      required: [true, "Kitchen address is required"],
      trim: true,
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    foodCategories: {
      type: [String],
      default: [],
    },
    cuisineTypes: {
      type: [String],
      default: [],
    },
    foodSafetyDetails: {
      type: String,
      trim: true,
      default: "",
    },
    kitchenImages: {
      type: [String],
      default: [],
    },
    approvalStatus: {
      type: String,
      enum: {
        values: ["pending", "approved", "rejected"],
        message: "{VALUE} is not a valid approval status",
      },
      default: "pending",
      index: true,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Helpful index for admin querying by status and created date
chefProfileSchema.index({ approvalStatus: 1, createdAt: -1 });

const ChefProfile = mongoose.models.ChefProfile || mongoose.model("ChefProfile", chefProfileSchema);

export default ChefProfile;
