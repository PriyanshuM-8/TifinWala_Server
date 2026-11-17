import express from "express";
import {
  listAuditLogsHandler,
  getAuditLogByIdHandler,
} from "../controllers/adminAuditLogController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/", listAuditLogsHandler);
router.get("/:logId", getAuditLogByIdHandler);

export default router;
