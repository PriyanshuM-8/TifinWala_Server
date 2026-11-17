import {
  getAllSubscriptions,
  getSubscriptionDetails,
  getSubscriptionStatistics,
  getSubscriptionMeals,
} from "../Services/adminSubscriptionService.js";

const handleError = (res, error) => {
  const statusCode = error.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: error.message || "An unexpected error occurred during administrative subscription request.",
  });
};

export const listSubscriptions = async (req, res) => {
  try {
    const result = await getAllSubscriptions(req.query);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getSubscriptionDetail = async (req, res) => {
  try {
    const result = await getSubscriptionDetails(req.params.id);
    return res.status(200).json({
      success: true,
      data: result,
      ...result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getPlatformStatistics = async (req, res) => {
  try {
    const stats = await getSubscriptionStatistics();
    return res.status(200).json({
      success: true,
      data: stats,
      ...stats,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getSubscriptionMealsHandler = async (req, res) => {
  try {
    const { page, limit, orderStatus, mealType, scheduledDateKey } = req.query;
    const result = await getSubscriptionMeals(req.params.id, {
      page,
      limit,
      orderStatus,
      mealType,
      scheduledDateKey,
    });
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
