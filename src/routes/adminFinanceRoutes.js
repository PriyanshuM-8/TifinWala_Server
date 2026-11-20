import express from "express";
import {
  getFinanceOverviewHandler,
  getFinanceTransactionsHandler,
  getCommissionBreakdownHandler,
  getCodFeeBreakdownHandler,
  getOnlinePaymentsBreakdownHandler,
  getPromotionalExpensesBreakdownHandler,
  listAllRefundsHandler,
  getRefundDetailsHandler,
  getFinanceAnalyticsHandler,
  reconcileLedgerHandler,
} from "../controllers/adminFinanceController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/overview", getFinanceOverviewHandler);
router.get("/analytics", getFinanceAnalyticsHandler);
router.post("/reconcile-ledger", reconcileLedgerHandler);
router.get("/transactions", getFinanceTransactionsHandler);
router.get("/commission", getCommissionBreakdownHandler);
router.get("/cod-fees", getCodFeeBreakdownHandler);
router.get("/online-payments", getOnlinePaymentsBreakdownHandler);
router.get("/promotional-expenses", getPromotionalExpensesBreakdownHandler);
router.get("/refunds", listAllRefundsHandler);
router.get("/refunds/:refundId", getRefundDetailsHandler);

export default router;
