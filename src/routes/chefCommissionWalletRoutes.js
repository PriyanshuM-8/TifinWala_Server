import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
  getChefCommissionWallet,
  getChefCommissionTransactionsList,
  rechargeCommissionWallet,
  verifyRechargeCommissionWallet,
} from "../controllers/chefWalletController.js";

const router = express.Router();

// Strict RBAC: All chef commission wallet endpoints require authenticated chef
router.use(protect, authorizeRoles("chef"));

router.get("/", getChefCommissionWallet);
router.get("/transactions", getChefCommissionTransactionsList);
router.post("/recharge", rechargeCommissionWallet);
router.post("/recharge/verify", verifyRechargeCommissionWallet);

export default router;
