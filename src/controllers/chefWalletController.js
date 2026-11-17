import {
  getChefEarningsWalletOverview,
  getChefEarningsList,
  getChefEarningById,
  getChefCommissionWalletOverview,
  getChefCommissionTransactions,
} from "../Services/chefWalletService.js";
import {
  initiateCommissionRecharge,
  verifyCommissionRecharge,
} from "../Services/paymentService.js";

/**
 * GET /api/chef/wallet
 * Returns summary of chef earnings balances (total, available, pending, settled).
 */
export const getChefEarningsWallet = async (req, res, next) => {
  try {
    const data = await getChefEarningsWalletOverview(req.user._id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chef/wallet/earnings
 * Returns paginated order-wise, subscription-meal-wise and reward earnings.
 */
export const getChefEarnings = async (req, res, next) => {
  try {
    const data = await getChefEarningsList(req.user._id, req.query);
    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chef/wallet/earnings/:earningId
 * Returns granular single earning entry with food items and delivery details.
 */
export const getChefEarningDetails = async (req, res, next) => {
  try {
    const data = await getChefEarningById(req.user._id, req.params.earningId);
    return res.status(200).json({
      success: true,
      earning: data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chef/commission-wallet
 * Returns chef prepaid commission wallet balances, order sequence, and ₹50 minimum balance check.
 */
export const getChefCommissionWallet = async (req, res, next) => {
  try {
    const data = await getChefCommissionWalletOverview(req.user._id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chef/commission-wallet/transactions
 * Returns paginated commission transactions ledger (reserves, captures, releases).
 */
export const getChefCommissionTransactionsList = async (req, res, next) => {
  try {
    const data = await getChefCommissionTransactions(req.user._id, req.query);
    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/chef/commission-wallet/recharge
 * Body: { amount } in Rupees
 */
export const rechargeCommissionWallet = async (req, res, next) => {
  try {
    const { amount } = req.body;
    if (!amount) {
      return res.status(400).json({ success: false, message: "amount is required." });
    }
    const result = await initiateCommissionRecharge(req.user._id, amount);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/chef/commission-wallet/recharge/verify
 * Body: { paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature }
 */
export const verifyRechargeCommissionWallet = async (req, res, next) => {
  try {
    const result = await verifyCommissionRecharge(req.user._id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
