import {
  discoverFoods,
  getDiscoveryCategories,
} from "../Services/discoveryService.js";

/**
 * GET /api/discovery/foods
 * Public endpoint to search, filter, sort and discover homemade foods.
 */
export const discoverFoodsHandler = async (req, res, next) => {
  try {
    const result = await discoverFoods(req.query);

    return res.status(200).json({
      success: true,
      message:
        result.foods.length > 0
          ? "Dishes discovered successfully."
          : "No dishes found matching your current search and filter criteria.",
      data: result.foods,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/discovery/categories
 * Public endpoint to retrieve all active categories for marketplace discovery.
 */
export const getDiscoveryCategoriesHandler = async (req, res, next) => {
  try {
    const categories = await getDiscoveryCategories();

    return res.status(200).json({
      success: true,
      message: "Active categories retrieved successfully.",
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
};
