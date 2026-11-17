import express from "express";
import {
  listSubscriptions,
  getSubscriptionDetail,
  getPlatformStatistics,
  getSubscriptionMealsHandler,
} from "../controllers/adminSubscriptionController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// All admin subscription endpoints require admin authentication
router.use(protect, authorizeRoles("admin"));

router.get("/statistics", getPlatformStatistics);
router.get("/:id/meals", getSubscriptionMealsHandler);
router.get("/:id", getSubscriptionDetail);
router.get("/", listSubscriptions);

export default router;
