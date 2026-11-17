import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
  getChefEarningsWallet,
  getChefEarnings,
  getChefEarningDetails,
} from "../controllers/chefWalletController.js";

const router = express.Router();

// Strict RBAC: All chef earnings wallet endpoints require authenticated chef
router.use(protect, authorizeRoles("chef"));

router.get("/", getChefEarningsWallet);
router.get("/transactions", getChefEarnings);
router.get("/earnings", getChefEarnings);
router.get("/earnings/:earningId", getChefEarningDetails);

export default router;
