import mongoose from "mongoose";
import Category, { generateSlug } from "../Models/Category.js";
import Food from "../Models/Food.js";
import { uploadImage, deleteImage } from "../Config/cloudinary.js";

/**
 * Creates a new main category (Admin only).
 * Validates unique name and slug. Handles optional image upload.
 */
export const createCategory = async ({ name, slug, description, image, imageFile, isActive = true }) => {
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    const error = new Error("Category name is required and must be at least 2 characters long.");
    error.statusCode = 400;
    throw error;
  }

  const trimmedName = name.trim();
  const finalSlug = slug && slug.trim() ? generateSlug(slug) : generateSlug(trimmedName);

  // Check duplicate name or slug (case-insensitive)
  const existingCategory = await Category.findOne({
    $or: [
      { name: { $regex: new RegExp(`^${trimmedName}$`, "i") } },
      { slug: finalSlug },
    ],
  });

  if (existingCategory) {
    const field = existingCategory.name.toLowerCase() === trimmedName.toLowerCase() ? "name" : "slug";
    const error = new Error(`Category with this ${field} already exists: '${existingCategory[field]}'.`);
    error.statusCode = 409;
    throw error;
  }

  // Handle image upload (either via Multer req.file buffer or raw string/URL)
  let imageUrl = "";
  let imagePublicId = "";

  if (imageFile && imageFile.buffer) {
    const uploaded = await uploadImage(imageFile.buffer, "gharkaswad/categories", imageFile.mimetype);
    if (uploaded) {
      imageUrl = uploaded.secure_url;
      imagePublicId = uploaded.public_id;
    }
  } else if (image && typeof image === "string" && image.trim()) {
    const uploaded = await uploadImage(image.trim(), "gharkaswad/categories");
    if (uploaded) {
      imageUrl = uploaded.secure_url;
      imagePublicId = uploaded.public_id;
    }
  }

  const category = await Category.create({
    name: trimmedName,
    slug: finalSlug,
    description: description ? description.trim() : "",
    image: imageUrl,
    imagePublicId,
    isActive: Boolean(isActive),
  });

  return category;
};

/**
 * Retrieves all categories with pagination, search, and status filter (Admin view).
 */
export const getAllCategoriesAdmin = async ({
  search,
  isActive,
  page = 1,
  limit = 20,
  sortBy = "createdAt",
  sortOrder = "desc",
}) => {
  const query = {};

  if (isActive !== undefined && isActive !== "all" && isActive !== "") {
    query.isActive = isActive === "true" || isActive === true;
  }

  if (search && search.trim() !== "") {
    const searchRegex = new RegExp(search.trim(), "i");
    query.$or = [{ name: searchRegex }, { description: searchRegex }, { slug: searchRegex }];
  }

  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNumber - 1) * pageSize;

  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  const total = await Category.countDocuments(query);
  const categories = await Category.find(query).sort(sort).skip(skip).limit(pageSize);

  // Calculate associated food count for each category
  const categoriesWithCount = await Promise.all(
    categories.map(async (cat) => {
      const foodCount = await Food.countDocuments({ categoryId: cat._id });
      return {
        ...cat.toObject(),
        foodCount,
      };
    })
  );

  return {
    categories: categoriesWithCount,
    pagination: {
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
      hasMore: pageNumber * pageSize < total,
    },
  };
};

/**
 * Retrieves all active categories for public display (Customers & Chefs).
 */
export const getActiveCategoriesPublic = async () => {
  const categories = await Category.find({ isActive: true })
    .select("name slug description image imagePublicId isActive createdAt")
    .sort({ name: 1 });

  return categories;
};

/**
 * Retrieves a single category by MongoDB ObjectId or slug.
 */
export const getCategoryById = async (identifier) => {
  let category = null;

  if (mongoose.Types.ObjectId.isValid(identifier)) {
    category = await Category.findById(identifier);
  } else {
    category = await Category.findOne({ slug: identifier });
  }

  if (!category) {
    const error = new Error("Category not found.");
    error.statusCode = 404;
    throw error;
  }

  const foodCount = await Food.countDocuments({ categoryId: category._id });

  return {
    ...category.toObject(),
    foodCount,
  };
};

/**
 * Updates an existing category (Admin only).
 * Supports replacing category image with safe old image cleanup.
 */
export const updateCategory = async (id, updateData, imageFile) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error("Invalid Category ID format.");
    error.statusCode = 400;
    throw error;
  }

  const category = await Category.findById(id);
  if (!category) {
    const error = new Error("Category not found.");
    error.statusCode = 404;
    throw error;
  }

  const { name, slug, description, image, isActive } = updateData;

  // Validate duplicate name or slug if being updated
  if (name && name.trim() !== category.name) {
    const trimmedName = name.trim();
    const existing = await Category.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
    });
    if (existing) {
      const error = new Error(`Another category with name '${trimmedName}' already exists.`);
      error.statusCode = 409;
      throw error;
    }
    category.name = trimmedName;
    if (!slug) {
      category.slug = generateSlug(trimmedName);
    }
  }

  if (slug && slug.trim() !== category.slug) {
    const finalSlug = generateSlug(slug.trim());
    const existingSlug = await Category.findOne({
      _id: { $ne: id },
      slug: finalSlug,
    });
    if (existingSlug) {
      const error = new Error(`Another category with slug '${finalSlug}' already exists.`);
      error.statusCode = 409;
      throw error;
    }
    category.slug = finalSlug;
  }

  if (description !== undefined) {
    category.description = description.trim();
  }

  if (isActive !== undefined) {
    category.isActive = Boolean(isActive);
  }

  // Handle image replacement safely
  let oldPublicId = category.imagePublicId;
  let newUploaded = null;

  if (imageFile && imageFile.buffer) {
    newUploaded = await uploadImage(imageFile.buffer, "gharkaswad/categories", imageFile.mimetype);
  } else if (image && typeof image === "string" && image.trim() && image.trim() !== category.image) {
    newUploaded = await uploadImage(image.trim(), "gharkaswad/categories");
  }

  if (newUploaded) {
    category.image = newUploaded.secure_url;
    category.imagePublicId = newUploaded.public_id;
  }

  await category.save();

  // Delete old Cloudinary image only AFTER successful database update
  if (newUploaded && oldPublicId && oldPublicId !== category.imagePublicId) {
    await deleteImage(oldPublicId);
  }

  return category;
};

/**
 * Toggles or sets category isActive status (Admin only).
 * Note: Deactivating a category does NOT delete associated food items.
 */
export const toggleCategoryStatus = async (id, explicitStatus) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error("Invalid Category ID format.");
    error.statusCode = 400;
    throw error;
  }

  const category = await Category.findById(id);
  if (!category) {
    const error = new Error("Category not found.");
    error.statusCode = 404;
    throw error;
  }

  if (explicitStatus !== undefined) {
    category.isActive = Boolean(explicitStatus);
  } else {
    category.isActive = !category.isActive;
  }

  await category.save();
  return category;
};

/**
 * Deletes a category (Admin only).
 * Rule: Cannot delete category if associated with food items! Suggests deactivation instead.
 */
export const deleteCategory = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error("Invalid Category ID format.");
    error.statusCode = 400;
    throw error;
  }

  const category = await Category.findById(id);
  if (!category) {
    const error = new Error("Category not found.");
    error.statusCode = 404;
    throw error;
  }

  // Check if any foods exist in this category
  const associatedFoodCount = await Food.countDocuments({ categoryId: category._id });

  if (associatedFoodCount > 0) {
    const error = new Error(
      `Cannot delete category: '${category.name}' is currently associated with ${associatedFoodCount} food item(s). Please deactivate the category instead (PATCH /api/admin/categories/${id}/status) or reassign the food items first.`
    );
    error.statusCode = 400;
    throw error;
  }

  const publicIdToDelete = category.imagePublicId;

  await Category.deleteOne({ _id: category._id });

  if (publicIdToDelete) {
    await deleteImage(publicIdToDelete);
  }

  return {
    success: true,
    message: `Category '${category.name}' deleted successfully.`,
    deletedId: id,
  };
};
