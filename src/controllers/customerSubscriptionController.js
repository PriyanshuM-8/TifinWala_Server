import {
  createSubscription as createSubscriptionService,
  getCustomerSubscriptions,
  getCustomerSubscriptionById,
  cancelCustomerSubscription,
} from "../Services/subscriptionService.js";
import {
  getCustomerSubscriptionMeals,
  getCustomerMealOrderById,
  skipCustomerMeal,
  skipCustomerDay,
  replaceRejectedMeal,
  getCustomerMealHistory,
} from "../Services/subscriptionMealService.js";

// Helper for consistent error response formatting
const handleError = (res, error) => {
  const statusCode = error.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: error.message || "An unexpected error occurred during subscription processing.",
  });
};

export const createSubscription = async (req, res) => {
  try {
    const result = await createSubscriptionService(req.user._id, req.body);
    return res.status(201).json({
      success: true,
      message: result.message,
      data: result.subscription,
      generatedMealsCount: result.generatedMealsCount,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getMySubscriptions = async (req, res) => {
  try {
    const result = await getCustomerSubscriptions(req.user._id, req.query);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getMySubscriptionById = async (req, res) => {
  try {
    const subscription = await getCustomerSubscriptionById(req.user._id, req.params.id);
    return res.status(200).json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getMySubscriptionMeals = async (req, res) => {
  try {
    const result = await getCustomerSubscriptionMeals(
      req.user._id,
      req.params.id,
      req.query
    );
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getMyMealOrderById = async (req, res) => {
  try {
    const meal = await getCustomerMealOrderById(req.user._id, req.params.mealId);
    return res.status(200).json({
      success: true,
      data: meal,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const skipMeal = async (req, res) => {
  try {
    const meal = await skipCustomerMeal(
      req.user._id,
      req.params.mealId,
      req.body.reason
    );
    return res.status(200).json({
      success: true,
      message: "Meal skipped successfully.",
      data: meal,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const skipDay = async (req, res) => {
  try {
    const result = await skipCustomerDay(
      req.user._id,
      req.params.id,
      req.body.dateKey,
      req.body.reason
    );
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const replaceMeal = async (req, res) => {
  try {
    const meal = await replaceRejectedMeal(
      req.user._id,
      req.params.mealId,
      req.body
    );
    return res.status(200).json({
      success: true,
      message: "Meal replacement confirmed. The dish has been scheduled with the new kitchen.",
      data: meal,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getMyMealHistory = async (req, res) => {
  try {
    const result = await getCustomerMealHistory(
      req.user._id,
      req.params.id,
      req.query
    );
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error);
  }
};

export const cancelSubscription = async (req, res) => {
  try {
    const result = await cancelCustomerSubscription(
      req.user._id,
      req.params.id,
      req.body.reason
    );
    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.subscription,
      subscription: result.subscription,
      cancelledMealsCount: result.cancelledMealsCount,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
