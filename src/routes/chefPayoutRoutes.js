import express from "express";
import {
  savePayoutDetails,
  getPayoutDetails,
  requestChefWithdrawal,
  listChefWithdrawals,
} from "../controllers/chefPayoutController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect);
router.use(authorizeRoles("chef"));

router.post("/details", savePayoutDetails);
router.get("/details", getPayoutDetails);
router.post("/withdraw", requestChefWithdrawal);
router.get("/withdrawals", listChefWithdrawals);

export default router;
