import express from "express";
import {
  listReviewsHandler,
  moderateReviewHandler,
} from "../controllers/adminReviewComplaintController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/", listReviewsHandler);
router.patch("/:reviewId/moderation", moderateReviewHandler);

export default router;
