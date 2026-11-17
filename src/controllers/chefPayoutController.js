import {
  updateChefPayoutDetails,
  requestWithdrawal,
} from "../Services/withdrawalService.js";
import ChefProfile from "../Models/ChefProfile.js";
import WalletWithdrawal from "../Models/WalletWithdrawal.js";

/**
 * POST /api/chef/payouts/details
 * Body: { payoutMethod, accountHolderName, accountNumber, ifscCode, bankName, upiId }
 */
export async function savePayoutDetails(req, res, next) {
  try {
    const result = await updateChefPayoutDetails(req.user._id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/chef/payouts/details
 */
export async function getPayoutDetails(req, res, next) {
  try {
    const profile = await ChefProfile.findOne({ userId: req.user._id });
    if (!profile || !profile.payoutDetails) {
      return res.status(200).json({
        success: true,
        payoutDetails: null,
        message: "No payout details configured yet.",
      });
    }

    const d = profile.payoutDetails;
    return res.status(200).json({
      success: true,
      payoutDetails: {
        payoutMethod: d.payoutMethod,
        accountHolderName: d.accountHolderName,
        maskedAccountNumber: d.maskedAccountNumber,
        maskedIfscCode: d.maskedIfscCode,
        bankName: d.bankName,
        upiId: d.upiId,
        isVerified: d.isVerified,
        updatedAt: d.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/chef/payouts/withdraw
 * Body: { amount }
 */
export async function requestChefWithdrawal(req, res, next) {
  try {
    const { amount } = req.body;
    if (!amount) {
      return res.status(400).json({ success: false, message: "amount is required." });
    }
    const result = await requestWithdrawal(req.user._id, amount);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/chef/payouts/withdrawals
 */
export async function listChefWithdrawals(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const skip = (page - 1) * limit;

    const filter = { chefId: req.user._id };
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [totalRecords, withdrawals] = await Promise.all([
      WalletWithdrawal.countDocuments(filter),
      WalletWithdrawal.find(filter)
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
}
