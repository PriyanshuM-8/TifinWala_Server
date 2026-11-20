import {
  requestAdminWithdrawal,
  listAdminWithdrawals,
  getAdminWithdrawalDetails,
  cancelAdminWithdrawal,
} from "../Services/adminWithdrawalService.js";

/**
 * POST /api/admin/withdrawals/request
 * Submit withdrawal request.
 */
export async function requestAdminWithdrawalHandler(req, res, next) {
  try {
    const result = await requestAdminWithdrawal(req.user._id, req.body);
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/withdrawals
 * List paginated admin withdrawals with filtering.
 */
export async function listAdminWithdrawalsHandler(req, res, next) {
  try {
    const { page, limit, status, startDate, endDate } = req.query;
    const result = await listAdminWithdrawals({
      page,
      limit,
      status,
      startDate,
      endDate,
    });
    return res.status(200).json({
      success: true,
      data: result.withdrawals,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/withdrawals/:id
 * Get single withdrawal details with ledger trail.
 */
export async function getAdminWithdrawalDetailsHandler(req, res, next) {
  try {
    const result = await getAdminWithdrawalDetails(req.params.id);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/withdrawals/:id/cancel
 * Cancel a pending/processing withdrawal.
 */
export async function cancelAdminWithdrawalHandler(req, res, next) {
  try {
    const { reason } = req.body;
    const result = await cancelAdminWithdrawal(
      req.user._id,
      req.params.id,
      reason
    );
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
