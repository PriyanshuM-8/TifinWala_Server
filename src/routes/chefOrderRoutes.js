import express from "express";
import {
  getChefOrdersHandler,
  getChefOrderByIdHandler,
  acceptOrderHandler,
  rejectOrderHandler,
  updateOrderStatusHandler,
} from "../controllers/chefOrderController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireApprovedChef } from "../middleware/requireApprovedChef.js";

const router = express.Router();

// All chef order endpoints require an authenticated approved chef
router.use(protect, requireApprovedChef);

router.get("/", getChefOrdersHandler);
router.get("/:orderId", getChefOrderByIdHandler);
router.patch("/:orderId/accept", acceptOrderHandler);
router.patch("/:orderId/reject", rejectOrderHandler);
router.patch("/:orderId/status", updateOrderStatusHandler);

export default router;
