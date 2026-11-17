import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
  getLoyaltyOverview,
  getCustomerLoyaltyProfile,
  adjustCustomerPoints,
  getAllCoupons,
  triggerExpirySweep,
} from "../controllers/adminLoyaltyController.js";

const router = express.Router();

// All admin loyalty routes require authenticated admin
router.use(protect, authorizeRoles("admin"));

router.get("/overview", getLoyaltyOverview);
router.get("/customers/:customerId", getCustomerLoyaltyProfile);
router.post("/adjust-points", adjustCustomerPoints);
router.get("/coupons", getAllCoupons);
router.post("/coupons/sweep-expiries", triggerExpirySweep);

export default router;
