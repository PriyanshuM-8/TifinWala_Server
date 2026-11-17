import express from "express";
import {
  listAllFoodsHandler,
  getFoodDetailsHandler,
  moderateFoodHandler,
} from "../controllers/adminFoodController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/", listAllFoodsHandler);
router.get("/:foodId", getFoodDetailsHandler);
router.patch("/:foodId/status", moderateFoodHandler);

export default router;
