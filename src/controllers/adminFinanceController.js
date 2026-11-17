import {
  getFinanceOverview,
  getFinanceTransactions,
  getCommissionBreakdown,
  getCodFeeBreakdown,
  getOnlinePaymentsBreakdown,
  getPromotionalExpensesBreakdown,
  listAllRefunds,
  getRefundDetails,
} from "../Services/adminFinanceService.js";

/**
 * GET /api/admin/finance/overview
 */
export async function getFinanceOverviewHandler(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const overview = await getFinanceOverview({ startDate, endDate });

    return res.status(200).json({
      success: true,
      ...overview,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/finance/transactions
 */
export async function getFinanceTransactionsHandler(req, res, next) {
  try {
    const { transactionType, startDate, endDate, page, limit } = req.query;
    const result = await getFinanceTransactions({
      transactionType,
      startDate,
      endDate,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/finance/commission
 */
export async function getCommissionBreakdownHandler(req, res, next) {
  try {
    const { startDate, endDate, page, limit } = req.query;
    const result = await getCommissionBreakdown({ startDate, endDate, page, limit });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/finance/cod-fees
 */
export async function getCodFeeBreakdownHandler(req, res, next) {
  try {
    const { startDate, endDate, page, limit } = req.query;
    const result = await getCodFeeBreakdown({ startDate, endDate, page, limit });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/finance/online-payments
 */
export async function getOnlinePaymentsBreakdownHandler(req, res, next) {
  try {
    const { startDate, endDate, page, limit } = req.query;
    const result = await getOnlinePaymentsBreakdown({ startDate, endDate, page, limit });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/finance/promotional-expenses
 */
export async function getPromotionalExpensesBreakdownHandler(req, res, next) {
  try {
    const { startDate, endDate, page, limit } = req.query;
    const result = await getPromotionalExpensesBreakdown({ startDate, endDate, page, limit });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/finance/refunds
 */
export async function listAllRefundsHandler(req, res, next) {
  try {
    const { status, refundType, startDate, endDate, page, limit } = req.query;
    const result = await listAllRefunds({
      status,
      refundType,
      startDate,
      endDate,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/finance/refunds/:refundId
 */
export async function getRefundDetailsHandler(req, res, next) {
  try {
    const refund = await getRefundDetails(req.params.refundId);

    return res.status(200).json({
      success: true,
      refund,
    });
  } catch (error) {
    next(error);
  }
}
