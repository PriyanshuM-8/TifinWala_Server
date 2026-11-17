import express from "express";
import {
  getMyAssignedMeals,
  getMyAssignedMealById,
  acceptMeal,
  rejectMeal,
  updateMealStatus,
} from "../controllers/chefSubscriptionController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { requireApprovedChef } from "../middleware/requireApprovedChef.js";

const router = express.Router();

// All chef subscription meal endpoints require authenticated and approved chef
router.use(protect, authorizeRoles("chef"), requireApprovedChef);

router.get("/", getMyAssignedMeals);
router.get("/:id", getMyAssignedMealById);
router.patch("/:id/accept", acceptMeal);
router.patch("/:id/reject", rejectMeal);
router.patch("/:id/status", updateMealStatus);

export default router;
