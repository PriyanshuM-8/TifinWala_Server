import express from "express";
import {
  listAllOrdersHandler,
  getOrderStatisticsHandler,
  getOrderDetailsHandler,
  cancelOrderByAdminHandler,
} from "../controllers/adminOrderController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/statistics", getOrderStatisticsHandler);
router.get("/:orderId", getOrderDetailsHandler);
router.post("/:orderId/cancel", cancelOrderByAdminHandler);
router.get("/", listAllOrdersHandler);

export default router;
