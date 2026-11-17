import express from "express";
import {
  createReviewHandler,
  getMyReviewsHandler,
} from "../controllers/customerReviewController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("customer"));

router.post("/", createReviewHandler);
router.get("/my-reviews", getMyReviewsHandler);

export default router;
