import express from "express";
import {
  listComplaintsHandler,
  getComplaintDetailsHandler,
  resolveComplaintHandler,
} from "../controllers/adminReviewComplaintController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/", listComplaintsHandler);
router.get("/:complaintId", getComplaintDetailsHandler);
router.patch("/:complaintId/status", resolveComplaintHandler);

export default router;
