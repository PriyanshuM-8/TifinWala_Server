import mongoose from "mongoose";

// Utility function to convert name into URL-safe slug
export const generateSlug = (name) => {
  return name
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // remove non-word chars
    .replace(/[\s_-]+/g, "-") // swap spaces for dashes
    .replace(/^-+|-+$/g, ""); // trim leading/trailing dashes
};

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      minlength: [2, "Category name must be at least 2 characters"],
      maxlength: [50, "Category name cannot exceed 50 characters"],
      unique: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    image: {
      type: String,
      default: "",
      trim: true,
    },
    imagePublicId: {
      type: String,
      default: "",
      trim: true,
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

// Auto-generate slug before validation if not provided
categorySchema.pre("validate", function () {
  if (this.name && (!this.slug || this.isModified("name"))) {
    this.slug = generateSlug(this.name);
  }
});

const Category = mongoose.models.Category || mongoose.model("Category", categorySchema);

export default Category;
