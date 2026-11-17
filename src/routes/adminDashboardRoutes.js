import express from "express";
import { getDashboardOverviewHandler } from "../controllers/adminDashboardController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/overview", getDashboardOverviewHandler);

export default router;
