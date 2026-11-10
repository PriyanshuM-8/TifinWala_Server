import express from "express";
import {
  createFoodHandler,
  getChefFoodsHandler,
  getChefFoodByIdHandler,
  updateChefFoodHandler,
  deleteChefFoodHandler,
  toggleFoodAvailabilityHandler,
} from "../controllers/foodController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireApprovedChef } from "../middleware/requireApprovedChef.js";
import { handleSingleUpload } from "../middleware/uploadMiddleware.js";

const router = express.Router();

// Strict protection: Only authenticated and APPROVED chefs can access
router.use(protect, requireApprovedChef);

/**
 * Chef Food Management Endpoints
 */
router.post("/", handleSingleUpload("image"), createFoodHandler);
router.get("/", getChefFoodsHandler);
router.get("/:id", getChefFoodByIdHandler);
router.put("/:id", handleSingleUpload("image"), updateChefFoodHandler);
router.delete("/:id", deleteChefFoodHandler);
router.patch("/:id/availability", toggleFoodAvailabilityHandler);

export default router;
