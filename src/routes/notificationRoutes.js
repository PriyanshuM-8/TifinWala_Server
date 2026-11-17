import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getNotificationsHandler,
  markNotificationReadHandler,
  markAllNotificationsReadHandler,
} from "../controllers/notificationController.js";

const router = express.Router();

// Enforce JWT authentication
router.use(protect);

router.get("/", getNotificationsHandler);
router.patch("/read-all", markAllNotificationsReadHandler);
router.patch("/:id/read", markNotificationReadHandler);

export default router;
