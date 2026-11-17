import mongoose from "mongoose";

/**
 * GeoJSON Point Sub-schema for chef kitchen location.
 * Stores coordinates in [longitude, latitude] order as per standard GeoJSON.
 */
const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
      required: true,
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator: function (coords) {
          if (!Array.isArray(coords) || coords.length !== 2) return false;
          const [longitude, latitude] = coords;
          return (
            typeof longitude === "number" &&
            typeof latitude === "number" &&
            !isNaN(longitude) &&
            !isNaN(latitude) &&
            longitude >= -180 &&
            longitude <= 180 &&
            latitude >= -90 &&
            latitude <= 90
          );
        },
        message:
          "Invalid coordinates: Longitude must be between -180 and 180, and latitude between -90 and 90.",
      },
    },
  },
  { _id: false }
);

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
    location: {
      type: pointSchema,
      default: undefined,
    },
    serviceRadiusKm: {
      type: Number,
      default: 10, // Default 10 km service radius
      min: [1, "Service radius must be at least 1 km"],
      max: [50, "Service radius cannot exceed 50 km"],
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
    payoutDetails: {
      payoutMethod: {
        type: String,
        enum: ["bank_transfer", "upi"],
        default: null,
      },
      accountHolderName: {
        type: String,
        trim: true,
        default: null,
      },
      encryptedAccountNumber: {
        type: String,
        default: null,
      },
      maskedAccountNumber: {
        type: String,
        default: null,
      },
      encryptedIfscCode: {
        type: String,
        default: null,
      },
      maskedIfscCode: {
        type: String,
        default: null,
      },
      bankName: {
        type: String,
        trim: true,
        default: null,
      },
      upiId: {
        type: String,
        trim: true,
        default: null,
      },
      isVerified: {
        type: Boolean,
        default: false,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Helpful index for admin querying by status and created date
chefProfileSchema.index({ approvalStatus: 1, createdAt: -1 });

// 2dsphere index on location with sparse: true for backward-compatible geospatial queries
chefProfileSchema.index({ location: "2dsphere" }, { sparse: true });

const ChefProfile = mongoose.models.ChefProfile || mongoose.model("ChefProfile", chefProfileSchema);

export default ChefProfile;
