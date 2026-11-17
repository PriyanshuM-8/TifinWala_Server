import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
  getLoyaltyBalance,
  getLoyaltyTransactions,
  getRewardCoupons,
  redeemCoupon,
  getCustomerRedemptionList,
  getInAppNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/customerLoyaltyController.js";

const router = express.Router();

// All customer loyalty routes require authenticated customer
router.use(protect, authorizeRoles("customer"));

router.get("/balance", getLoyaltyBalance);
router.get("/transactions", getLoyaltyTransactions);
router.get("/coupons", getRewardCoupons);
router.post("/coupons/:couponId/redeem", redeemCoupon);
router.post("/redeem", redeemCoupon);
router.get("/redemptions", getCustomerRedemptionList);
router.get("/notifications", getInAppNotifications);
router.patch("/notifications/read-all", markAllNotificationsRead);
router.patch("/notifications/:notificationId/read", markNotificationRead);

export default router;
