import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
  getCustomerWallet,
  getCustomerWalletTransactions,
  getCustomerWalletCoupons,
  getCustomerWalletRedemptions,
} from "../controllers/customerWalletController.js";

const router = express.Router();

// Strict RBAC: All customer wallet endpoints require authenticated customer
router.use(protect, authorizeRoles("customer"));

router.get("/", getCustomerWallet);
router.get("/transactions", getCustomerWalletTransactions);
router.get("/coupons", getCustomerWalletCoupons);
router.get("/redemptions", getCustomerWalletRedemptions);

export default router;
