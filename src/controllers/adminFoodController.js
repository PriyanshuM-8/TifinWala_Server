import {
  listAllFoods,
  getFoodDetails,
  moderateFood,
} from "../Services/adminFoodService.js";

/**
 * GET /api/admin/foods
 */
export async function listAllFoodsHandler(req, res, next) {
  try {
    const {
      search,
      chefId,
      categoryId,
      foodType,
      availability,
      moderationStatus,
      isActive,
      page,
      limit,
    } = req.query;

    const result = await listAllFoods({
      search,
      chefId,
      categoryId,
      foodType,
      availability,
      moderationStatus,
      isActive,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/foods/:foodId
 */
export async function getFoodDetailsHandler(req, res, next) {
  try {
    const result = await getFoodDetails(req.params.foodId);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/foods/:foodId/status
 */
export async function moderateFoodHandler(req, res, next) {
  try {
    const { moderationStatus, isActive, reason } = req.body;
    const food = await moderateFood(req.params.foodId, req.user._id, {
      moderationStatus,
      isActive,
      reason,
    });

    return res.status(200).json({
      success: true,
      message: `Food item '${food.name}' status updated successfully.`,
      food,
    });
  } catch (error) {
    next(error);
  }
}
