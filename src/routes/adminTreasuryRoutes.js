import express from "express";
import { getTreasuryOverviewHandler } from "../controllers/adminTreasuryController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/overview", getTreasuryOverviewHandler);

export default router;
