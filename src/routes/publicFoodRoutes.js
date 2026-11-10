import express from "express";
import {
  getPublicFoodsHandler,
  getPublicFoodByIdHandler,
  getPublicFoodsByCategoryHandler,
  getPublicFoodsByChefHandler,
} from "../controllers/foodController.js";

const router = express.Router();

/**
 * Public Customer Food Browsing Endpoints
 * (No authentication required)
 */
router.get("/", getPublicFoodsHandler);
router.get("/:id", getPublicFoodByIdHandler);
router.get("/category/:categoryId", getPublicFoodsByCategoryHandler);
router.get("/chef/:chefId", getPublicFoodsByChefHandler);

export default router;
