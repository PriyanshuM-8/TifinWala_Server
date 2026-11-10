import express from "express";
import {
  getMyProfile,
  updateMyProfile,
  getMyApprovalStatus,
  testApprovedKitchenOperation,
} from "../controllers/chefController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { requireApprovedChef } from "../Middleware/requireApprovedChef.js";

const router = express.Router();

// All chef routes require authenticated user with 'chef' role
router.use(protect, authorizeRoles("chef"));

/**
 * Chef Profile Routes
 */
router.get("/profile", getMyProfile);
router.put("/profile", updateMyProfile);
router.get("/approval-status", getMyApprovalStatus);

/**
 * Protected Chef Operations (Requires Admin Approval)
 */
router.get("/kitchen/operations", requireApprovedChef, testApprovedKitchenOperation);

export default router;
