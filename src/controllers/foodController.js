import {
  createFoodItem,
  getChefFoodItems,
  getChefFoodItemById,
  updateChefFoodItem,
  deleteChefFoodItem,
  toggleChefFoodAvailability,
  getPublicFoods,
  getPublicFoodById,
  getPublicFoodsByCategory,
  getPublicFoodsByChef,
} from "../Services/foodService.js";

// =========================================================================
// CHEF FOOD HANDLERS (Authenticated & Approved Chef)
// =========================================================================

/**
 * POST /api/chef/foods
 * Approved chef creates a new food item. Supports multipart/form-data with image upload or JSON.
 */
export const createFoodHandler = async (req, res, next) => {
  try {
    const food = await createFoodItem(req.user._id, req.body, req.file);
    return res.status(201).json({
      success: true,
      message: "Food item created successfully.",
      food,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chef/foods
 * Approved chef views all their own food items with pagination and filters.
 */
export const getChefFoodsHandler = async (req, res, next) => {
  try {
    const result = await getChefFoodItems(req.user._id, req.query);
    return res.status(200).json({
      success: true,
      count: result.foods.length,
      pagination: result.pagination,
      foods: result.foods,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chef/foods/:id
 * Approved chef views a single food item belonging to them.
 */
export const getChefFoodByIdHandler = async (req, res, next) => {
  try {
    const food = await getChefFoodItemById(req.user._id, req.params.id);
    return res.status(200).json({
      success: true,
      food,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/chef/foods/:id
 * Approved chef updates their own food item. Supports multipart/form-data with image replacement or JSON.
 */
export const updateChefFoodHandler = async (req, res, next) => {
  try {
    const food = await updateChefFoodItem(req.user._id, req.params.id, req.body, req.file);
    return res.status(200).json({
      success: true,
      message: "Food item updated successfully.",
      food,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/chef/foods/:id
 * Approved chef deletes their own food item (deletes associated Cloudinary image).
 */
export const deleteChefFoodHandler = async (req, res, next) => {
  try {
    const result = await deleteChefFoodItem(req.user._id, req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/chef/foods/:id/availability
 * Approved chef toggles or sets food availability status.
 */
export const toggleFoodAvailabilityHandler = async (req, res, next) => {
  try {
    const { availability } = req.body;
    const food = await toggleChefFoodAvailability(req.user._id, req.params.id, availability);
    return res.status(200).json({
      success: true,
      message: `Food item is now ${food.availability}.`,
      food,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// PUBLIC CUSTOMER FOOD HANDLERS (No Auth Required)
// =========================================================================

/**
 * GET /api/foods
 * Public customer browses all active, available, in-stock foods with filters & search.
 */
export const getPublicFoodsHandler = async (req, res, next) => {
  try {
    const result = await getPublicFoods(req.query);
    return res.status(200).json({
      success: true,
      count: result.foods.length,
      pagination: result.pagination,
      foods: result.foods,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/foods/:id
 * Public customer views details of a single available and in-stock food item.
 */
export const getPublicFoodByIdHandler = async (req, res, next) => {
  try {
    const food = await getPublicFoodById(req.params.id);
    return res.status(200).json({
      success: true,
      food,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/foods/category/:categoryId
 * Public customer views all available foods for a specific category.
 */
export const getPublicFoodsByCategoryHandler = async (req, res, next) => {
  try {
    const result = await getPublicFoodsByCategory(req.params.categoryId, req.query);
    return res.status(200).json({
      success: true,
      count: result.foods.length,
      pagination: result.pagination,
      foods: result.foods,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/foods/chef/:chefId
 * Public customer views all available foods for a specific approved chef / kitchen.
 */
export const getPublicFoodsByChefHandler = async (req, res, next) => {
  try {
    const result = await getPublicFoodsByChef(req.params.chefId, req.query);
    return res.status(200).json({
      success: true,
      count: result.foods.length,
      pagination: result.pagination,
      foods: result.foods,
    });
  } catch (error) {
    next(error);
  }
};
