import express from "express";
import {
  createOrderHandler,
  getCustomerOrdersHandler,
  getCustomerOrderByIdHandler,
  cancelOrderHandler,
} from "../controllers/orderController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// All customer order endpoints require an authenticated customer
router.use(protect, authorizeRoles("customer"));

router.post("/", createOrderHandler);
router.get("/", getCustomerOrdersHandler);
router.get("/:orderId", getCustomerOrderByIdHandler);
router.patch("/:orderId/cancel", cancelOrderHandler);

export default router;
