import express from "express";
import {
  createSubscription,
  getMySubscriptions,
  getMySubscriptionById,
  getMySubscriptionMeals,
  getMyMealOrderById,
  skipMeal,
  skipDay,
  replaceMeal,
  getMyMealHistory,
  cancelSubscription,
} from "../controllers/customerSubscriptionController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// All customer subscription endpoints require customer authentication
router.use(protect, authorizeRoles("customer"));

// Subscription lifecycle routes
router.post("/", createSubscription);
router.get("/", getMySubscriptions);
router.get("/:id", getMySubscriptionById);
router.get("/:id/meals", getMySubscriptionMeals);
router.get("/:id/history", getMyMealHistory);
router.patch("/:id/cancel", cancelSubscription);
router.patch("/:id/skip-day", skipDay);

// Individual meal operations
router.get("/meals/:mealId", getMyMealOrderById);
router.patch("/meals/:mealId/skip", skipMeal);
router.patch("/meals/:mealId/replace", replaceMeal);

export default router;
