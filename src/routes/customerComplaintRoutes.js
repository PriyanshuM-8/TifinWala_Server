import express from "express";
import {
  createComplaintHandler,
  getMyComplaintsHandler,
} from "../controllers/customerComplaintController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("customer"));

router.post("/", createComplaintHandler);
router.get("/my-complaints", getMyComplaintsHandler);

export default router;
