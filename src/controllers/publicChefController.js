import {
  getNearbyChefs,
  getPublicChefById,
  getPublicFoodsByChefId,
} from "../Services/publicChefService.js";

/**
 * GET /api/chefs/nearby
 * Public endpoint to discover nearby home chefs via GPS coordinates or city name.
 */
export const getNearbyChefsHandler = async (req, res, next) => {
  try {
    const result = await getNearbyChefs(req.query);

    return res.status(200).json({
      success: true,
      message:
        result.chefs.length > 0
          ? "Nearby chefs retrieved successfully."
          : "No chefs found matching the specified location criteria.",
      data: result.chefs,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chefs/:chefId
 * Public endpoint to view verified details of an approved home chef.
 */
export const getPublicChefByIdHandler = async (req, res, next) => {
  try {
    const chef = await getPublicChefById(req.params.chefId);

    return res.status(200).json({
      success: true,
      message: "Chef details retrieved successfully.",
      data: chef,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chefs/:chefId/foods
 * Public endpoint to list all available dishes offered by a specific approved chef.
 */
export const getPublicFoodsByChefHandler = async (req, res, next) => {
  try {
    const result = await getPublicFoodsByChefId(req.params.chefId, req.query);

    return res.status(200).json({
      success: true,
      message: "Chef foods retrieved successfully.",
      chef: result.chef,
      data: result.foods,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};
