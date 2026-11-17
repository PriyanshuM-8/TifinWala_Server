import express from "express";
import {
  getOrderReportHandler,
  getRevenueReportHandler,
  getChefReportHandler,
  getCustomerReportHandler,
  getFoodReportHandler,
  getSubscriptionReportHandler,
  getPaymentReportHandler,
  getCancellationReportHandler,
} from "../controllers/adminReportController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/orders", getOrderReportHandler);
router.get("/revenue", getRevenueReportHandler);
router.get("/chefs", getChefReportHandler);
router.get("/customers", getCustomerReportHandler);
router.get("/foods", getFoodReportHandler);
router.get("/subscriptions", getSubscriptionReportHandler);
router.get("/payments", getPaymentReportHandler);
router.get("/cancellations", getCancellationReportHandler);

export default router;
