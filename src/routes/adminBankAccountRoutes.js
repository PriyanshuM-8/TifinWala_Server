import express from "express";
import {
  listAdminBankAccountsHandler,
  addAdminBankAccountHandler,
  getAdminBankAccountHandler,
  verifyAdminBankAccountHandler,
  setDefaultAdminBankAccountHandler,
  deleteAdminBankAccountHandler,
} from "../controllers/adminBankAccountController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/", listAdminBankAccountsHandler);
router.post("/", addAdminBankAccountHandler);
router.get("/:id", getAdminBankAccountHandler);
router.post("/:id/verify", verifyAdminBankAccountHandler);
router.patch("/:id/set-default", setDefaultAdminBankAccountHandler);
router.delete("/:id", deleteAdminBankAccountHandler);

export default router;
