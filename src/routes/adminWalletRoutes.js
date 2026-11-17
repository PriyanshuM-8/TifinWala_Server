import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
  getWalletsOverview,
  getCustomerWallet,
  getChefWallets,
  getCommissionTransactions,
  adjustChefWallet,
  listWithdrawals,
  getWithdrawalDetails,
  approveWithdrawalRequest,
  rejectWithdrawalRequest,
  recordManualPayout,
  refundDisputeOrder,
  getConfiguration,
  updateConfiguration,
} from "../controllers/adminWalletController.js";

const router = express.Router();

// Strict RBAC: All admin wallet endpoints require authenticated admin
router.use(protect, authorizeRoles("admin"));

router.get("/overview", getWalletsOverview);
router.get("/customers/:customerId", getCustomerWallet);
router.get("/chefs/:chefId", getChefWallets);
router.get("/transactions", getCommissionTransactions);
router.get("/commissions", getCommissionTransactions);
router.post("/chefs/:chefId/adjust", adjustChefWallet);

// Phase 10: Withdrawals & Payouts management
router.get("/withdrawals", listWithdrawals);
router.get("/withdrawals/:withdrawalId/details", getWithdrawalDetails);
router.post("/withdrawals/:withdrawalId/approve", approveWithdrawalRequest);
router.post("/withdrawals/:withdrawalId/reject", rejectWithdrawalRequest);
router.post("/withdrawals/:withdrawalId/pay", recordManualPayout);

// Phase 10: Refunds & Dispute resolution
router.post("/refunds/dispute", refundDisputeOrder);

// Phase 10: Platform configuration
router.get("/config", getConfiguration);
router.put("/config", updateConfiguration);

export default router;
