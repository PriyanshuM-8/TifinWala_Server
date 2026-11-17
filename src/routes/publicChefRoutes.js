import express from "express";
import {
  getNearbyChefsHandler,
  getPublicChefByIdHandler,
  getPublicFoodsByChefHandler,
} from "../controllers/publicChefController.js";
import { getPublicChefReviewsHandler } from "../controllers/customerReviewController.js";

const router = express.Router();

/**
 * Public Chef Discovery Routes (No Authentication Required)
 */
// 1. Nearby chefs with GeoJSON coordinates or city fallback
router.get("/nearby", getNearbyChefsHandler);

// 2. Foods by specific chef
router.get("/:chefId/foods", getPublicFoodsByChefHandler);

// 3. Approved public reviews for a specific chef
router.get("/:chefId/reviews", getPublicChefReviewsHandler);

// 4. Public chef details
router.get("/:chefId", getPublicChefByIdHandler);

export default router;
