import {
  getCustomerRewardWallet,
  getCustomerRewardTransactions,
  getCustomerRewardCoupons,
  getCustomerRewardRedemptions,
} from "../Services/customerWalletService.js";

/**
 * GET /api/customer/wallet
 * Returns customer reward wallet overview aggregated strictly from Phase 8.
 */
export const getCustomerWallet = async (req, res, next) => {
  try {
    const data = await getCustomerRewardWallet(req.user._id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/wallet/transactions
 * Returns paginated customer loyalty points ledger history.
 */
export const getCustomerWalletTransactions = async (req, res, next) => {
  try {
    const data = await getCustomerRewardTransactions(req.user._id, req.query);
    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/wallet/coupons
 * Returns customer reward coupons categorized by status.
 */
export const getCustomerWalletCoupons = async (req, res, next) => {
  try {
    const data = await getCustomerRewardCoupons(req.user._id, req.query);
    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/wallet/redemptions
 * Returns customer reward redemptions history.
 */
export const getCustomerWalletRedemptions = async (req, res, next) => {
  try {
    const redemptions = await getCustomerRewardRedemptions(req.user._id);
    return res.status(200).json({
      success: true,
      redemptions,
    });
  } catch (error) {
    next(error);
  }
};
