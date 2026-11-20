import express from "express";
import {
  requestAdminWithdrawalHandler,
  listAdminWithdrawalsHandler,
  getAdminWithdrawalDetailsHandler,
  cancelAdminWithdrawalHandler,
} from "../controllers/adminWithdrawalController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.post("/request", requestAdminWithdrawalHandler);
router.get("/", listAdminWithdrawalsHandler);
router.get("/:id", getAdminWithdrawalDetailsHandler);
router.post("/:id/cancel", cancelAdminWithdrawalHandler);

export default router;
