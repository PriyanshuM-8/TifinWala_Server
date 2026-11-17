import express from "express";
import {
  getSettingsHandler,
  updateSettingsHandler,
} from "../controllers/adminSettingController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/", getSettingsHandler);
router.patch("/", updateSettingsHandler);

export default router;
