import mongoose from "mongoose";
import Food from "../Models/Food.js";
import Category from "../Models/Category.js";
import User from "../Models/User.js";
import ChefProfile from "../Models/ChefProfile.js";
import { uploadImage, deleteImage } from "../Config/cloudinary.js";

/**
 * Validates, normalizes, and sanitizes custom tags.
 *
 * Rules:
 * 1. Maximum 10 tags per food item.
 * 2. Maximum 30 characters per tag.
 * 3. Trim whitespace and lowercase.
 * 4. Automatically deduplicate tags.
 * 5. Reject HTML/script/dangerous characters.
 * 6. Reject empty tags.
 */
export const validateAndNormalizeTags = (tagsInput) => {
  if (!tagsInput) return [];

  let rawTags = [];
  if (Array.isArray(tagsInput)) {
    rawTags = tagsInput;
  } else if (typeof tagsInput === "string") {
    try {
      const parsed = JSON.parse(tagsInput);
      if (Array.isArray(parsed)) {
        rawTags = parsed;
      } else {
        rawTags = tagsInput.split(",");
      }
    } catch {
      rawTags = tagsInput.split(",");
    }
  }

  const normalized = [];
  const seen = new Set();

  for (const item of rawTags) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().toLowerCase().replace(/^#+/, "");
    if (!trimmed) continue;

    // Reject HTML, scripts, angle brackets, curly braces, and Javascript pseudo-protocols
    if (/[<>{}]|script|javascript:|on\w+=/i.test(trimmed)) {
      const err = new Error(`Invalid tag '${trimmed}': tags cannot contain HTML, scripts, or unsafe characters.`);
      err.statusCode = 400;
      throw err;
    }

    if (trimmed.length > 30) {
      const err = new Error(`Tag '${trimmed}' exceeds the maximum allowed length of 30 characters.`);
      err.statusCode = 400;
      throw err;
    }

    // Only allow alphanumeric characters, spaces, hyphens, and underscores
    if (!/^[a-zA-Z0-9\s-_]+$/.test(trimmed)) {
      const err = new Error(
        `Tag '${trimmed}' contains invalid characters. Use letters, numbers, spaces, and hyphens only.`
      );
      err.statusCode = 400;
      throw err;
    }

    const cleanTag = trimmed.replace(/\s+/g, "-");
    if (!seen.has(cleanTag)) {
      seen.add(cleanTag);
      normalized.push(cleanTag);
    }
  }

  if (normalized.length > 10) {
    const err = new Error("Maximum 10 custom tags allowed per food item.");
    err.statusCode = 400;
    throw err;
  }

  return normalized;
};

// Helper to validate and fetch an active category
const validateActiveCategory = async (categoryId) => {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    const error = new Error("Invalid Category ID format.");
    error.statusCode = 400;
    throw error;
  }

  const category = await Category.findById(categoryId);
  if (!category) {
    const error = new Error("Selected category does not exist.");
    error.statusCode = 404;
    throw error;
  }

  if (!category.isActive) {
    const error = new Error(
      `Category '${category.name}' is currently inactive. Food items cannot be assigned to inactive categories.`
    );
    error.statusCode = 400;
    throw error;
  }

  return category;
};

// =========================================================================
// PART C: CHEF FOOD MANAGEMENT SERVICE
// =========================================================================

/**
 * Creates a new food item for the authenticated approved chef.
 */
export const createFoodItem = async (chefUserId, foodData, imageFile) => {
  const {
    categoryId,
    name,
    description,
    price,
    image,
    foodType,
    preparationTime,
    availableQuantity,
    ingredients,
    tags,
    availability = "available",
    servingSize,
  } = foodData;

  // 1. Validate Category existence and active status
  await validateActiveCategory(categoryId);

  // 2. Validate Name & Description
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    const error = new Error("Food name is required (minimum 2 characters).");
    error.statusCode = 400;
    throw error;
  }

  if (!description || typeof description !== "string" || description.trim().length < 5) {
    const error = new Error("Description is required (minimum 5 characters).");
    error.statusCode = 400;
    throw error;
  }

  // 3. Validate Numbers: Price must be strictly > 0
  const parsedPrice = Number(price);
  if (isNaN(parsedPrice) || parsedPrice <= 0) {
    const error = new Error("Price is required and must be greater than 0.");
    error.statusCode = 400;
    throw error;
  }

  // Preparation time must be > 0
  const parsedPrepTime = Number(preparationTime);
  if (isNaN(parsedPrepTime) || parsedPrepTime <= 0) {
    const error = new Error("Preparation time is required and must be a positive number greater than 0.");
    error.statusCode = 400;
    throw error;
  }

  // Available quantity cannot be negative
  const parsedQuantity = availableQuantity !== undefined ? Number(availableQuantity) : 0;
  if (isNaN(parsedQuantity) || parsedQuantity < 0) {
    const error = new Error("Available quantity cannot be negative.");
    error.statusCode = 400;
    throw error;
  }

  // 4. Validate Food Type
  if (!foodType || !["veg", "non_veg"].includes(foodType)) {
    const error = new Error("Food type must be either 'veg' or 'non_veg'.");
    error.statusCode = 400;
    throw error;
  }

  // 5. Validate and normalize custom tags
  const cleanTags = validateAndNormalizeTags(tags);

  // 6. Image Upload via Multer buffer or string URL
  let imageUrl = "";
  let imagePublicId = "";

  if (imageFile && imageFile.buffer) {
    const uploaded = await uploadImage(imageFile.buffer, "gharkaswad/foods", imageFile.mimetype);
    if (uploaded) {
      imageUrl = uploaded.secure_url;
      imagePublicId = uploaded.public_id;
    }
  } else if (image && typeof image === "string" && image.trim()) {
    const uploaded = await uploadImage(image.trim(), "gharkaswad/foods");
    if (uploaded) {
      imageUrl = uploaded.secure_url;
      imagePublicId = uploaded.public_id;
    }
  }

  // 7. Parse ingredients
  const formattedIngredients = Array.isArray(ingredients)
    ? ingredients.map((i) => (typeof i === "string" ? i.trim() : i)).filter(Boolean)
    : typeof ingredients === "string"
    ? ingredients.split(",").map((i) => i.trim()).filter(Boolean)
    : [];

  const food = await Food.create({
    chefId: chefUserId,
    categoryId,
    name: name.trim(),
    description: description.trim(),
    tags: cleanTags,
    price: parsedPrice,
    image: imageUrl || undefined,
    imagePublicId,
    foodType,
    preparationTime: parsedPrepTime,
    availableQuantity: parsedQuantity,
    ingredients: formattedIngredients,
    availability: availability === "unavailable" ? "unavailable" : "available",
    servingSize: servingSize ? servingSize.trim() : "1 Portion",
    isActive: true,
  });

  await food.populate("categoryId", "name slug");
  return food;
};

/**
 * Retrieves all food items created by the authenticated chef.
 */
export const getChefFoodItems = async (chefUserId, queryOptions = {}) => {
  const {
    availability,
    foodType,
    categoryId,
    isActive,
    search,
    tag,
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = queryOptions;

  const query = { chefId: chefUserId };

  if (availability && ["available", "unavailable"].includes(availability)) {
    query.availability = availability;
  }

  if (foodType && ["veg", "non_veg"].includes(foodType)) {
    query.foodType = foodType;
  }

  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
    query.categoryId = categoryId;
  }

  if (isActive !== undefined && isActive !== "all" && isActive !== "") {
    query.isActive = isActive === "true" || isActive === true;
  }

  if (tag && tag.trim()) {
    query.tags = tag.trim().toLowerCase();
  }

  if (search && search.trim() !== "") {
    query.name = { $regex: new RegExp(search.trim(), "i") };
  }

  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNumber - 1) * pageSize;

  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  const total = await Food.countDocuments(query);
  const foods = await Food.find(query)
    .populate("categoryId", "name slug isActive")
    .sort(sort)
    .skip(skip)
    .limit(pageSize);

  return {
    foods,
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
 * Retrieves a single food item belonging to the authenticated chef.
 */
export const getChefFoodItemById = async (chefUserId, foodId) => {
  if (!mongoose.Types.ObjectId.isValid(foodId)) {
    const error = new Error("Invalid Food ID format.");
    error.statusCode = 400;
    throw error;
  }

  const food = await Food.findById(foodId).populate("categoryId", "name slug isActive");

  if (!food) {
    const error = new Error("Food item not found.");
    error.statusCode = 404;
    throw error;
  }

  // Enforce ownership
  if (food.chefId.toString() !== chefUserId.toString()) {
    const error = new Error("Access forbidden: You can only view and manage your own food items.");
    error.statusCode = 403;
    throw error;
  }

  return food;
};

/**
 * Updates a food item belonging to the authenticated chef.
 * Uses strict allowlisting. Never passes complete req.body directly to MongoDB.
 */
export const updateChefFoodItem = async (chefUserId, foodId, updateData, imageFile) => {
  if (!mongoose.Types.ObjectId.isValid(foodId)) {
    const error = new Error("Invalid Food ID format.");
    error.statusCode = 400;
    throw error;
  }

  const food = await Food.findById(foodId);

  if (!food) {
    const error = new Error("Food item not found.");
    error.statusCode = 404;
    throw error;
  }

  // Rule: Chef can only update their own food
  if (food.chefId.toString() !== chefUserId.toString()) {
    const error = new Error("Access forbidden: You cannot modify another chef's food item.");
    error.statusCode = 403;
    throw error;
  }

  // Disallow modifying protected fields: chefId, isActive
  if (updateData.chefId && updateData.chefId.toString() !== chefUserId.toString()) {
    const error = new Error("Cannot reassign food item to another chef.");
    error.statusCode = 403;
    throw error;
  }

  // Category change validation
  if (updateData.categoryId && updateData.categoryId.toString() !== food.categoryId.toString()) {
    await validateActiveCategory(updateData.categoryId);
    food.categoryId = updateData.categoryId;
  }

  if (updateData.name !== undefined) {
    if (typeof updateData.name !== "string" || updateData.name.trim().length < 2) {
      const error = new Error("Food name must be at least 2 characters long.");
      error.statusCode = 400;
      throw error;
    }
    food.name = updateData.name.trim();
  }

  if (updateData.description !== undefined) {
    if (typeof updateData.description !== "string" || updateData.description.trim().length < 5) {
      const error = new Error("Description must be at least 5 characters long.");
      error.statusCode = 400;
      throw error;
    }
    food.description = updateData.description.trim();
  }

  if (updateData.price !== undefined) {
    const parsedPrice = Number(updateData.price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      const error = new Error("Price must be greater than 0.");
      error.statusCode = 400;
      throw error;
    }
    food.price = parsedPrice;
  }

  if (updateData.preparationTime !== undefined) {
    const parsedTime = Number(updateData.preparationTime);
    if (isNaN(parsedTime) || parsedTime <= 0) {
      const error = new Error("Preparation time must be a positive number greater than 0.");
      error.statusCode = 400;
      throw error;
    }
    food.preparationTime = parsedTime;
  }

  if (updateData.availableQuantity !== undefined) {
    const parsedQty = Number(updateData.availableQuantity);
    if (isNaN(parsedQty) || parsedQty < 0) {
      const error = new Error("Available quantity cannot be negative.");
      error.statusCode = 400;
      throw error;
    }
    food.availableQuantity = parsedQty;
  }

  if (updateData.foodType !== undefined) {
    if (!["veg", "non_veg"].includes(updateData.foodType)) {
      const error = new Error("Food type must be either 'veg' or 'non_veg'.");
      error.statusCode = 400;
      throw error;
    }
    food.foodType = updateData.foodType;
  }

  if (updateData.tags !== undefined) {
    food.tags = validateAndNormalizeTags(updateData.tags);
  }

  if (updateData.ingredients !== undefined) {
    food.ingredients = Array.isArray(updateData.ingredients)
      ? updateData.ingredients.map((i) => (typeof i === "string" ? i.trim() : i)).filter(Boolean)
      : typeof updateData.ingredients === "string"
      ? updateData.ingredients.split(",").map((i) => i.trim()).filter(Boolean)
      : [];
  }

  if (updateData.availability !== undefined) {
    if (!["available", "unavailable"].includes(updateData.availability)) {
      const error = new Error("Availability must be either 'available' or 'unavailable'.");
      error.statusCode = 400;
      throw error;
    }
    food.availability = updateData.availability;
  }

  if (updateData.servingSize !== undefined) {
    food.servingSize = updateData.servingSize.trim();
  }

  // Handle image replacement safely
  let oldPublicId = food.imagePublicId;
  let newUploaded = null;

  if (imageFile && imageFile.buffer) {
    newUploaded = await uploadImage(imageFile.buffer, "gharkaswad/foods", imageFile.mimetype);
  } else if (
    updateData.image &&
    typeof updateData.image === "string" &&
    updateData.image.trim() &&
    updateData.image.trim() !== food.image
  ) {
    newUploaded = await uploadImage(updateData.image.trim(), "gharkaswad/foods");
  }

  if (newUploaded) {
    food.image = newUploaded.secure_url;
    food.imagePublicId = newUploaded.public_id;
  }

  await food.save();

  // Delete old Cloudinary image only AFTER database update succeeds
  if (newUploaded && oldPublicId && oldPublicId !== food.imagePublicId) {
    await deleteImage(oldPublicId);
  }

  await food.populate("categoryId", "name slug");
  return food;
};

/**
 * Toggles or sets food availability status (Chef only).
 */
export const toggleChefFoodAvailability = async (chefUserId, foodId, explicitStatus) => {
  if (!mongoose.Types.ObjectId.isValid(foodId)) {
    const error = new Error("Invalid Food ID format.");
    error.statusCode = 400;
    throw error;
  }

  const food = await Food.findById(foodId);
  if (!food) {
    const error = new Error("Food item not found.");
    error.statusCode = 404;
    throw error;
  }

  if (food.chefId.toString() !== chefUserId.toString()) {
    const error = new Error("Access forbidden: You cannot modify another chef's food item.");
    error.statusCode = 403;
    throw error;
  }

  if (explicitStatus && ["available", "unavailable"].includes(explicitStatus)) {
    food.availability = explicitStatus;
  } else {
    food.availability = food.availability === "available" ? "unavailable" : "available";
  }

  await food.save();
  return food;
};

/**
 * Deletes a food item (Chef only). Deletes associated Cloudinary image.
 */
export const deleteChefFoodItem = async (chefUserId, foodId) => {
  if (!mongoose.Types.ObjectId.isValid(foodId)) {
    const error = new Error("Invalid Food ID format.");
    error.statusCode = 400;
    throw error;
  }

  const food = await Food.findById(foodId);
  if (!food) {
    const error = new Error("Food item not found.");
    error.statusCode = 404;
    throw error;
  }

  if (food.chefId.toString() !== chefUserId.toString()) {
    const error = new Error("Access forbidden: You can only delete your own food items.");
    error.statusCode = 403;
    throw error;
  }

  const publicIdToDelete = food.imagePublicId;

  await Food.deleteOne({ _id: foodId });

  if (publicIdToDelete) {
    await deleteImage(publicIdToDelete);
  }

  return {
    success: true,
    message: `Food item '${food.name}' was deleted successfully.`,
    deletedId: foodId,
  };
};

// =========================================================================
// PART E: PUBLIC CUSTOMER FOOD BROWSING SERVICE
// =========================================================================

/**
 * Resolves list of valid, approved chef IDs and active category IDs for public queries.
 */
const getPublicEligibilityCriteria = async () => {
  // 1. Approved Chef Profiles
  const approvedProfiles = await ChefProfile.find({ approvalStatus: "approved" }).select("userId");
  const approvedUserIds = approvedProfiles.map((p) => p.userId);

  // 2. Active & verified User accounts for these chefs
  const activeChefUsers = await User.find({
    _id: { $in: approvedUserIds },
    isActive: true,
    emailVerified: true,
    role: "chef",
  }).select("_id");
  const eligibleChefIds = activeChefUsers.map((u) => u._id);

  // 3. Active Categories
  const activeCategories = await Category.find({ isActive: true }).select("_id");
  const eligibleCategoryIds = activeCategories.map((c) => c._id);

  return {
    eligibleChefIds,
    eligibleCategoryIds,
  };
};

/**
 * Browses all publicly available food items with search, filters, sorting & pagination.
 *
 * Enforces Public Food Visibility Rules:
 * - Food isActive is true
 * - Food availability is "available"
 * - availableQuantity is GREATER than 0 (Out-of-stock items hidden!)
 * - Associated category is active
 * - Chef user account is active & verified
 * - Chef profile approvalStatus is "approved"
 */
export const getPublicFoods = async (queryParams = {}) => {
  const {
    search,
    category,
    foodType,
    minPrice,
    maxPrice,
    tag,
    page = 1,
    limit = 12,
    sort,
    sortBy,
    chefId,
  } = queryParams;

  // Resolve eligibility filters (approved chef & active category)
  const { eligibleChefIds, eligibleCategoryIds } = await getPublicEligibilityCriteria();

  const query = {
    isActive: true,
    availability: "available",
    availableQuantity: { $gt: 0 }, // Out-of-stock items hidden
    chefId: { $in: eligibleChefIds },
    categoryId: { $in: eligibleCategoryIds },
  };

  // Chef filter
  if (chefId && mongoose.Types.ObjectId.isValid(chefId)) {
    query.chefId = chefId;
  }

  // Category filter by ID or slug
  if (category && category.trim() !== "") {
    if (mongoose.Types.ObjectId.isValid(category)) {
      query.categoryId = category;
    } else {
      const catDoc = await Category.findOne({ slug: category.trim().toLowerCase(), isActive: true });
      if (catDoc) {
        query.categoryId = catDoc._id;
      } else {
        return {
          foods: [],
          pagination: { total: 0, page: 1, limit: parseInt(limit, 10) || 12, totalPages: 0, hasMore: false },
        };
      }
    }
  }

  // Veg / Non-veg filter
  if (foodType && ["veg", "non_veg"].includes(foodType.toLowerCase())) {
    query.foodType = foodType.toLowerCase();
  }

  // Custom Tag filter (e.g. ?tag=homemade)
  if (tag && tag.trim()) {
    const cleanFilterTag = tag.trim().toLowerCase().replace(/\s+/g, "-");
    query.tags = cleanFilterTag;
  }

  // Price range filter
  if (minPrice !== undefined || maxPrice !== undefined) {
    query.price = {};
    if (minPrice !== undefined && !isNaN(Number(minPrice))) {
      query.price.$gte = Number(minPrice);
    }
    if (maxPrice !== undefined && !isNaN(Number(maxPrice))) {
      query.price.$lte = Number(maxPrice);
    }
  }

  // Search by food name
  if (search && search.trim() !== "") {
    query.name = { $regex: new RegExp(search.trim(), "i") };
  }

  // Sorting
  const sortParam = sort || sortBy;
  const sortObj = {};
  if (sortParam === "price_asc" || sortParam === "price_low") {
    sortObj.price = 1;
  } else if (sortParam === "price_desc" || sortParam === "price_high") {
    sortObj.price = -1;
  } else if (sortParam === "prep_time") {
    sortObj.preparationTime = 1;
  } else {
    // Default newest
    sortObj.createdAt = -1;
  }

  // Pagination
  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
  const skip = (pageNumber - 1) * pageSize;

  const total = await Food.countDocuments(query);
  const foods = await Food.find(query)
    .populate("categoryId", "name slug")
    .populate("chefId", "name")
    .sort(sortObj)
    .skip(skip)
    .limit(pageSize);

  // Attach safe chef kitchen details without exposing private user data (passwords, email, phone)
  const foodsWithKitchen = await Promise.all(
    foods.map(async (food) => {
      const chefProfile = await ChefProfile.findOne({ userId: food.chefId._id }).select(
        "kitchenName ownerName city cuisineTypes"
      );
      return {
        _id: food._id,
        name: food.name,
        description: food.description,
        tags: food.tags,
        price: food.price,
        image: food.image,
        foodType: food.foodType,
        preparationTime: food.preparationTime,
        availableQuantity: food.availableQuantity,
        ingredients: food.ingredients,
        servingSize: food.servingSize,
        availability: food.availability,
        category: food.categoryId,
        kitchen: chefProfile
          ? {
              id: chefProfile._id,
              kitchenName: chefProfile.kitchenName,
              ownerName: chefProfile.ownerName,
              city: chefProfile.city,
              cuisineTypes: chefProfile.cuisineTypes,
            }
          : null,
        createdAt: food.createdAt,
      };
    })
  );

  return {
    foods: foodsWithKitchen,
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
 * Retrieves public details of a single food item.
 * Must verify public visibility rules: active food, active category, approved chef, and availableQuantity > 0.
 */
export const getPublicFoodById = async (foodId) => {
  if (!mongoose.Types.ObjectId.isValid(foodId)) {
    const error = new Error("Invalid Food ID format.");
    error.statusCode = 400;
    throw error;
  }

  const food = await Food.findOne({
    _id: foodId,
    isActive: true,
    availability: "available",
  }).populate("categoryId", "name slug isActive");

  if (!food || !food.categoryId || !food.categoryId.isActive) {
    const error = new Error("This food item is currently unavailable or inactive.");
    error.statusCode = 404;
    throw error;
  }

  // Rule: out-of-stock items must not appear in public food details
  if (food.availableQuantity <= 0) {
    const error = new Error("This food item is currently out of stock.");
    error.statusCode = 404;
    throw error;
  }

  // Verify chef is active & approved
  const chefUser = await User.findOne({
    _id: food.chefId,
    isActive: true,
    emailVerified: true,
    role: "chef",
  });

  const chefProfile = await ChefProfile.findOne({
    userId: food.chefId,
    approvalStatus: "approved",
  }).select("kitchenName ownerName kitchenAddress city description cuisineTypes foodCategories");

  if (!chefUser || !chefProfile) {
    const error = new Error("This food item's home kitchen is currently inactive.");
    error.statusCode = 404;
    throw error;
  }

  // Never expose private fields: password, email, phone, JWT
  return {
    _id: food._id,
    name: food.name,
    description: food.description,
    tags: food.tags,
    price: food.price,
    image: food.image,
    foodType: food.foodType,
    preparationTime: food.preparationTime,
    availableQuantity: food.availableQuantity,
    ingredients: food.ingredients,
    servingSize: food.servingSize,
    availability: food.availability,
    category: {
      id: food.categoryId._id,
      name: food.categoryId.name,
      slug: food.categoryId.slug,
    },
    kitchen: {
      id: chefProfile._id,
      kitchenName: chefProfile.kitchenName,
      ownerName: chefProfile.ownerName,
      city: chefProfile.city,
      description: chefProfile.description,
      cuisineTypes: chefProfile.cuisineTypes,
    },
    createdAt: food.createdAt,
  };
};

/**
 * Public endpoint: Browses all foods for a specific category.
 */
export const getPublicFoodsByCategory = async (categoryIdentifier, queryParams = {}) => {
  let catId = categoryIdentifier;

  if (!mongoose.Types.ObjectId.isValid(categoryIdentifier)) {
    const cat = await Category.findOne({ slug: categoryIdentifier, isActive: true });
    if (!cat) {
      const error = new Error("Category not found or is currently inactive.");
      error.statusCode = 404;
      throw error;
    }
    catId = cat._id.toString();
  }

  return getPublicFoods({
    ...queryParams,
    category: catId,
  });
};

/**
 * Public endpoint: Browses all foods for a specific approved chef / kitchen.
 */
export const getPublicFoodsByChef = async (chefIdentifier, queryParams = {}) => {
  let chefUserId = chefIdentifier;

  // If passed ChefProfile ID instead of User ID
  if (mongoose.Types.ObjectId.isValid(chefIdentifier)) {
    const profile = await ChefProfile.findById(chefIdentifier);
    if (profile) {
      chefUserId = profile.userId.toString();
    }
  }

  const { eligibleChefIds } = await getPublicEligibilityCriteria();
  const isEligible = eligibleChefIds.some((id) => id.toString() === chefUserId.toString());

  if (!isEligible) {
    const error = new Error("Kitchen not found or not currently active for orders.");
    error.statusCode = 404;
    throw error;
  }

  return getPublicFoods({
    ...queryParams,
    chefId: chefUserId,
  });
};
