import {
  getChefSubscriptionMeals,
  getChefSubscriptionMealById,
  acceptSubscriptionMeal,
  rejectSubscriptionMeal,
  updateSubscriptionMealStatus,
} from "../Services/chefSubscriptionService.js";

const handleError = (res, error) => {
  const statusCode = error.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: error.message || "An unexpected error occurred during chef meal operation.",
  });
};

export const getMyAssignedMeals = async (req, res) => {
  try {
    const result = await getChefSubscriptionMeals(req.user._id, req.query);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getMyAssignedMealById = async (req, res) => {
  try {
    const meal = await getChefSubscriptionMealById(req.user._id, req.params.id);
    return res.status(200).json({
      success: true,
      data: meal,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const acceptMeal = async (req, res) => {
  try {
    const result = await acceptSubscriptionMeal(req.user._id, req.params.id);
    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.meal,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const rejectMeal = async (req, res) => {
  try {
    const result = await rejectSubscriptionMeal(
      req.user._id,
      req.params.id,
      req.body.rejectionReason
    );
    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.meal,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const updateMealStatus = async (req, res) => {
  try {
    const result = await updateSubscriptionMealStatus(
      req.user._id,
      req.params.id,
      req.body.status
    );
    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.meal,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
