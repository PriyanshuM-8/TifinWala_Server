import express from "express";
import {
  createOrderPayment,
  createSubscriptionPayment,
  verifyPayment,
  getPaymentDetails,
} from "../controllers/paymentController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect);
router.use(authorizeRoles("customer"));

router.post("/order", createOrderPayment);
router.post("/subscription", createSubscriptionPayment);
router.post("/verify", verifyPayment);
router.get("/:paymentId", getPaymentDetails);

export default router;
