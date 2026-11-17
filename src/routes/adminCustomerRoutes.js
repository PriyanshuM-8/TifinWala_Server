import express from "express";
import {
  listCustomersHandler,
  getCustomerDetailsHandler,
  updateCustomerStatusHandler,
  getCustomerOrdersHandler,
  getCustomerSubscriptionsHandler,
  getCustomerRewardsHandler,
} from "../controllers/adminCustomerController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/", listCustomersHandler);
router.get("/:customerId", getCustomerDetailsHandler);
router.patch("/:customerId/status", updateCustomerStatusHandler);
router.get("/:customerId/orders", getCustomerOrdersHandler);
router.get("/:customerId/subscriptions", getCustomerSubscriptionsHandler);
router.get("/:customerId/rewards", getCustomerRewardsHandler);

export default router;
