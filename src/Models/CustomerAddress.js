import mongoose from "mongoose";

/**
 * GeoJSON Point Sub-schema for customer address location.
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

const customerAddressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: [2, "Full name must be at least 2 characters long"],
      maxlength: [100, "Full name cannot exceed 100 characters"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      validate: {
        validator: function (v) {
          if (!v || typeof v !== "string") return false;
          const cleaned = v.replace(/[\s-]/g, "");
          return /^(?:\+?91)?[6-9]\d{9}$/.test(cleaned);
        },
        message: "Please provide a valid 10-digit Indian mobile phone number.",
      },
    },
    addressType: {
      type: String,
      enum: {
        values: ["home", "office", "hostel", "other"],
        message: "{VALUE} is not a valid address type. Allowed types: home, office, hostel, other",
      },
      default: "home",
      lowercase: true,
      trim: true,
    },
    addressLine: {
      type: String,
      required: [true, "Address line is required"],
      trim: true,
      minlength: [5, "Address line must be at least 5 characters long"],
      maxlength: [250, "Address line cannot exceed 250 characters"],
    },
    landmark: {
      type: String,
      trim: true,
      default: "",
      maxlength: [100, "Landmark cannot exceed 100 characters"],
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
      minlength: [2, "City must be at least 2 characters long"],
      maxlength: [60, "City cannot exceed 60 characters"],
    },
    state: {
      type: String,
      required: [true, "State is required"],
      trim: true,
      minlength: [2, "State must be at least 2 characters long"],
      maxlength: [60, "State cannot exceed 60 characters"],
    },
    pincode: {
      type: String,
      required: [true, "Pincode is required"],
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return false;
          return /^[1-9][0-9]{5}$/.test(String(v).trim());
        },
        message: "Please provide a valid 6-digit postal pincode.",
      },
    },
    location: {
      type: pointSchema,
      required: false,
      default: undefined,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// 2dsphere index on location with sparse: true
// Only addresses containing geospatial coordinates are indexed, avoiding null-entry index errors
customerAddressSchema.index({ location: "2dsphere" }, { sparse: true });

// Compound index to optimize querying user addresses ordered by default status and recency
customerAddressSchema.index({ userId: 1, isDefault: -1, createdAt: -1 });

const CustomerAddress =
  mongoose.models.CustomerAddress ||
  mongoose.model("CustomerAddress", customerAddressSchema);

export default CustomerAddress;
