import {
  getGlobalWalletsOverview,
  getAdminCustomerWalletDetails,
  getAdminChefWalletDetails,
  getAdminCommissionTransactions,
  adminAdjustChefWallet,
} from "../Services/adminWalletService.js";
import WalletWithdrawal from "../Models/WalletWithdrawal.js";
import {
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  adminRecordManualPayout,
  adminGetDecryptedPayoutInfo,
} from "../Services/withdrawalService.js";
import { processDisputeDeliveredOrderRefund } from "../Services/refundService.js";
import {
  getPlatformConfig,
  updatePlatformConfig,
} from "../Services/platformConfigService.js";

/**
 * GET /api/admin/wallets/overview
 * Returns system-wide global wallets analytics across customers, chefs, and platform commissions.
 */
export const getWalletsOverview = async (req, res, next) => {
  try {
    const data = await getGlobalWalletsOverview();
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/wallets/customers/:customerId
 * Returns detailed customer reward wallet & points history for admin inspection.
 */
export const getCustomerWallet = async (req, res, next) => {
  try {
    const data = await getAdminCustomerWalletDetails(req.params.customerId);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/wallets/chefs/:chefId
 * Returns detailed chef earnings & commission wallets for admin inspection.
 */
export const getChefWallets = async (req, res, next) => {
  try {
    const data = await getAdminChefWalletDetails(req.params.chefId);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/wallets/commissions (or /transactions)
 * Returns paginated platform commission ledger transactions.
 */
export const getCommissionTransactions = async (req, res, next) => {
  try {
    const data = await getAdminCommissionTransactions(req.query);
    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/wallets/chefs/:chefId/adjust
 * Authorized admin adjustment for chef commission or earnings wallet with mandatory audit reason.
 */
export const adjustChefWallet = async (req, res, next) => {
  try {
    const { walletType, actionType, amountPaise, amountRupees, auditReason } =
      req.body;

    const parsedPaise =
      typeof amountPaise === "number"
        ? amountPaise
        : typeof amountRupees === "number"
        ? Math.round(amountRupees * 100)
        : 0;

    const result = await adminAdjustChefWallet({
      adminUserId: req.user._id,
      chefId: req.params.chefId,
      walletType,
      actionType,
      amountPaise: parsedPaise,
      auditReason,
    });

    return res.status(200).json({
      success: true,
      message: `Chef ${walletType} wallet adjusted successfully.`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/wallets/withdrawals
 */
export const listWithdrawals = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.chefId) {
      filter.chefId = req.query.chefId;
    }

    const [totalRecords, withdrawals] = await Promise.all([
      WalletWithdrawal.countDocuments(filter),
      WalletWithdrawal.find(filter)
        .populate("chefId", "name email phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      pagination: {
        totalRecords,
        page,
        limit,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
      withdrawals,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/wallets/withdrawals/:withdrawalId/details
 */
export const getWithdrawalDetails = async (req, res, next) => {
  try {
    const data = await adminGetDecryptedPayoutInfo(req.params.withdrawalId);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/wallets/withdrawals/:withdrawalId/approve
 */
export const approveWithdrawalRequest = async (req, res, next) => {
  try {
    const result = await adminApproveWithdrawal(req.params.withdrawalId, req.user._id);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/wallets/withdrawals/:withdrawalId/reject
 */
export const rejectWithdrawalRequest = async (req, res, next) => {
  try {
    const result = await adminRejectWithdrawal(
      req.params.withdrawalId,
      req.user._id,
      req.body.reason
    );
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/wallets/withdrawals/:withdrawalId/pay
 */
export const recordManualPayout = async (req, res, next) => {
  try {
    const result = await adminRecordManualPayout(
      req.params.withdrawalId,
      req.user._id,
      req.body
    );
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/wallets/refunds/dispute
 */
export const refundDisputeOrder = async (req, res, next) => {
  try {
    const { orderId, reason, amountPaise } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId is required." });
    }
    const result = await processDisputeDeliveredOrderRefund(
      orderId,
      req.user._id,
      reason,
      amountPaise
    );
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/wallets/config
 */
export const getConfiguration = async (req, res, next) => {
  try {
    const config = await getPlatformConfig();
    return res.status(200).json({
      success: true,
      config,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/wallets/config
 */
export const updateConfiguration = async (req, res, next) => {
  try {
    const config = await updatePlatformConfig(req.body, req.user._id);
    return res.status(200).json({
      success: true,
      message: "Platform configuration updated successfully.",
      config,
    });
  } catch (error) {
    next(error);
  }
};
