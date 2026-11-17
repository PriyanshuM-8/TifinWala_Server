import express from "express";
import {
  listAllChefs,
  getChefDetails,
  approveChef,
  rejectChef,
  updateChefStatusHandler,
  getChefOrdersHandler,
  getChefFoodsHandler,
  getChefEarningsHandler,
  getChefWalletsHandler,
  getChefCommissionTransactionsHandler,
} from "../controllers/adminChefController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Strict admin-only protection
router.use(protect, authorizeRoles("admin"));

/**
 * Admin Chef Management Routes
 */
router.get("/", listAllChefs);
router.get("/:id", getChefDetails);
router.patch("/:id/approve", approveChef);
router.patch("/:id/reject", rejectChef);
router.patch("/:id/status", updateChefStatusHandler);
router.get("/:id/orders", getChefOrdersHandler);
router.get("/:id/foods", getChefFoodsHandler);
router.get("/:id/earnings", getChefEarningsHandler);
router.get("/:id/wallets", getChefWalletsHandler);
router.get("/:id/transactions", getChefCommissionTransactionsHandler);

export default router;
