import mongoose from "mongoose";

const foodSchema = new mongoose.Schema(
  {
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Chef ID is required"],
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category ID is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Food name is required"],
      trim: true,
      minlength: [2, "Food name must be at least 2 characters long"],
      maxlength: [100, "Food name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      minlength: [5, "Description must be at least 5 characters long"],
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0.01, "Price must be greater than 0"],
      index: true,
    },
    image: {
      type: String,
      trim: true,
      default: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop",
    },
    imagePublicId: {
      type: String,
      trim: true,
      default: "",
    },
    foodType: {
      type: String,
      enum: {
        values: ["veg", "non_veg"],
        message: "{VALUE} is not a valid food type (allowed: veg, non_veg)",
      },
      required: [true, "Food type (veg/non_veg) is required"],
      index: true,
    },
    preparationTime: {
      type: Number,
      required: [true, "Preparation time in minutes is required"],
      min: [1, "Preparation time must be at least 1 minute"],
    },
    availableQuantity: {
      type: Number,
      required: [true, "Available quantity is required"],
      min: [0, "Quantity cannot be negative"],
      default: 0,
      index: true,
    },
    ingredients: {
      type: [String],
      default: [],
    },
    availability: {
      type: String,
      enum: {
        values: ["available", "unavailable"],
        message: "{VALUE} is not a valid availability status",
      },
      default: "available",
      index: true,
    },
    servingSize: {
      type: String,
      trim: true,
      default: "1 Portion",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for optimal public search, filtering, and ordering
foodSchema.index({ isActive: 1, availability: 1, availableQuantity: 1, categoryId: 1, price: 1 });
foodSchema.index({ chefId: 1, isActive: 1 });
foodSchema.index({ tags: 1, isActive: 1, availability: 1 });
foodSchema.index({ name: "text", description: "text" });

const Food = mongoose.models.Food || mongoose.model("Food", foodSchema);

export default Food;
