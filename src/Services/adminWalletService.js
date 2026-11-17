import AdminWallet from "../Models/AdminWallet.js";
import AdminWalletTransaction from "../Models/AdminWalletTransaction.js";
import ChefWallet from "../Models/ChefWallet.js";
import ChefCommissionWallet from "../Models/ChefCommissionWallet.js";
import ChefCommissionTransaction from "../Models/ChefCommissionTransaction.js";
import CustomerLoyaltyAccount from "../Models/CustomerLoyaltyAccount.js";
import RewardCoupon from "../Models/RewardCoupon.js";
import User from "../Models/User.js";
import { getCustomerRewardWallet } from "./customerWalletService.js";
import {
  getChefEarningsWalletOverview,
  getChefCommissionWalletOverview,
} from "./chefWalletService.js";
import { getOrCreateAdminWallet } from "./commissionService.js";
import { logAdminAction } from "./auditLogService.js";

/**
 * Returns global platform-wide wallet metrics across all wallets.
 */
export const getGlobalWalletsOverview = async () => {
  const [
    adminWallet,
    chefEarningsAggregate,
    chefCommissionAggregate,
    customerRewardAggregate,
    couponStats,
  ] = await Promise.all([
    getOrCreateAdminWallet(),
    ChefWallet.aggregate([
      {
        $group: {
          _id: null,
          totalChefs: { $sum: 1 },
          totalEarnedPaise: { $sum: "$totalEarnedPaise" },
          totalAvailablePaise: { $sum: "$availableBalancePaise" },
          totalPendingPaise: { $sum: "$pendingBalancePaise" },
          totalSettledPaise: { $sum: "$settledBalancePaise" },
        },
      },
    ]),
    ChefCommissionWallet.aggregate([
      {
        $group: {
          _id: null,
          totalCommissionWallets: { $sum: 1 },
          totalCommissionBalancePaise: { $sum: "$balancePaise" },
          totalAvailableCommissionPaise: { $sum: "$availableBalancePaise" },
          totalReservedCommissionPaise: { $sum: "$reservedBalancePaise" },
          totalCommissionPaidPaise: { $sum: "$totalCommissionPaidPaise" },
        },
      },
    ]),
    CustomerLoyaltyAccount.aggregate([
      {
        $group: {
          _id: null,
          totalAccounts: { $sum: 1 },
          totalActiveBalanceUnits: { $sum: "$balanceUnits" },
          totalLifetimeEarnedUnits: { $sum: "$lifetimeEarnedUnits" },
        },
      },
    ]),
    RewardCoupon.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const earnings = chefEarningsAggregate[0] || {
    totalChefs: 0,
    totalEarnedPaise: 0,
    totalAvailablePaise: 0,
    totalPendingPaise: 0,
    totalSettledPaise: 0,
  };

  const commission = chefCommissionAggregate[0] || {
    totalCommissionWallets: 0,
    totalCommissionBalancePaise: 0,
    totalAvailableCommissionPaise: 0,
    totalReservedCommissionPaise: 0,
    totalCommissionPaidPaise: 0,
  };

  const loyalty = customerRewardAggregate[0] || {
    totalAccounts: 0,
    totalActiveBalanceUnits: 0,
    totalLifetimeEarnedUnits: 0,
  };

  const couponCounts = {
    active: 0,
    locked_in_redemption: 0,
    redeemed: 0,
    expired: 0,
  };
  couponStats.forEach((stat) => {
    if (couponCounts[stat._id] !== undefined) {
      couponCounts[stat._id] = stat.count;
    }
  });

  return {
    adminPlatformCommission: {
      totalCommissionEarnedRupees: Number(
        (adminWallet.totalCommissionEarnedPaise / 100).toFixed(2)
      ),
      availableCommissionBalanceRupees: Number(
        (adminWallet.availableBalancePaise / 100).toFixed(2)
      ),
      settledCommissionRupees: Number(
        (adminWallet.settledBalancePaise / 100).toFixed(2)
      ),
      balancesPaise: {
        totalCommissionEarnedPaise: adminWallet.totalCommissionEarnedPaise,
        availableBalancePaise: adminWallet.availableBalancePaise,
        settledBalancePaise: adminWallet.settledBalancePaise,
      },
    },
    chefEarningsEconomy: {
      totalChefsWithWallets: earnings.totalChefs,
      totalPlatformEarningsRupees: Number((earnings.totalEarnedPaise / 100).toFixed(2)),
      totalAvailableBalanceRupees: Number((earnings.totalAvailablePaise / 100).toFixed(2)),
      totalPendingBalanceRupees: Number((earnings.totalPendingPaise / 100).toFixed(2)),
      totalSettledBalanceRupees: Number((earnings.totalSettledPaise / 100).toFixed(2)),
    },
    chefCommissionWalletsEconomy: {
      totalCommissionWallets: commission.totalCommissionWallets,
      totalCommissionBalanceRupees: Number(
        (commission.totalCommissionBalancePaise / 100).toFixed(2)
      ),
      totalAvailableCommissionRupees: Number(
        (commission.totalAvailableCommissionPaise / 100).toFixed(2)
      ),
      totalReservedCommissionRupees: Number(
        (commission.totalReservedCommissionPaise / 100).toFixed(2)
      ),
      totalCommissionCapturedRupees: Number(
        (commission.totalCommissionPaidPaise / 100).toFixed(2)
      ),
    },
    customerRewardsEconomy: {
      totalCustomerAccounts: loyalty.totalAccounts,
      circulatingPoints: Number(((loyalty.totalActiveBalanceUnits || 0) / 3).toFixed(4)),
      lifetimeEarnedPoints: Number(
        ((loyalty.totalLifetimeEarnedUnits || 0) / 3).toFixed(4)
      ),
      coupons: {
        activeCount: couponCounts.active,
        reservedCount: couponCounts.locked_in_redemption,
        redeemedCount: couponCounts.redeemed,
        expiredCount: couponCounts.expired,
        totalIssued:
          couponCounts.active +
          couponCounts.locked_in_redemption +
          couponCounts.redeemed +
          couponCounts.expired,
      },
    },
  };
};

/**
 * Returns complete customer reward wallet details for admin inspection.
 */
export const getAdminCustomerWalletDetails = async (customerId) => {
  const customer = await User.findById(customerId).select(
    "name email phone role isActive createdAt"
  );
  if (!customer) {
    const error = new Error("Customer not found.");
    error.statusCode = 404;
    throw error;
  }

  const wallet = await getCustomerRewardWallet(customerId);
  return { customer, rewardWallet: wallet };
};

/**
 * Returns complete chef earnings & commission wallets for admin inspection.
 */
export const getAdminChefWalletDetails = async (chefId) => {
  const chef = await User.findById(chefId).select(
    "name email phone role isActive createdAt"
  );
  if (!chef) {
    const error = new Error("Chef not found.");
    error.statusCode = 404;
    throw error;
  }

  const [earningsWallet, commissionWallet] = await Promise.all([
    getChefEarningsWalletOverview(chefId),
    getChefCommissionWalletOverview(chefId),
  ]);

  return { chef, earningsWallet, commissionWallet };
};

/**
 * Returns paginated platform commission ledger transactions.
 */
export const getAdminCommissionTransactions = async ({
  page = 1,
  limit = 20,
  chefId,
}) => {
  const query = {};
  if (chefId) query.chefId = chefId;

  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const [transactions, total] = await Promise.all([
    AdminWalletTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("chefId", "name email")
      .populate("orderId", "orderNumber totalAmount deliveryType")
      .populate("subscriptionMealOrderId", "mealOrderNumber mealType")
      .lean(),
    AdminWalletTransaction.countDocuments(query),
  ]);

  return {
    transactions,
    pagination: {
      total,
      page: numericPage,
      limit: numericLimit,
      pages: Math.ceil(total / numericLimit) || 1,
    },
  };
};

/**
 * Admin manual adjustment with mandatory audit log.
 */
export const adminAdjustChefWallet = async ({
  adminUserId,
  chefId,
  walletType = "commission", // 'commission' or 'earnings'
  actionType = "credit",     // 'credit' or 'debit'
  amountPaise,
  auditReason,
}) => {
  if (typeof amountPaise !== "number" || amountPaise <= 0) {
    const error = new Error("amountPaise must be a positive integer.");
    error.statusCode = 400;
    throw error;
  }

  if (!auditReason || typeof auditReason !== "string" || auditReason.trim().length < 5) {
    const error = new Error(
      "A detailed auditReason (at least 5 characters) is required for wallet adjustments."
    );
    error.statusCode = 400;
    throw error;
  }

  if (walletType === "commission") {
    let wallet = await ChefCommissionWallet.findOne({ chefId });
    if (!wallet) {
      wallet = await ChefCommissionWallet.create({
        chefId,
        balancePaise: 0,
        availableBalancePaise: 0,
        reservedBalancePaise: 0,
        totalCommissionPaidPaise: 0,
      });
    }

    if (actionType === "debit" && wallet.availableBalancePaise < amountPaise) {
      const error = new Error(
        `Insufficient commission wallet available balance. Cannot deduct ₹${(
          amountPaise / 100
        ).toFixed(2)} from available ₹${(wallet.availableBalancePaise / 100).toFixed(2)}.`
      );
      error.statusCode = 400;
      throw error;
    }

    const multiplier = actionType === "credit" ? 1 : -1;
    const updatedWallet = await ChefCommissionWallet.findOneAndUpdate(
      {
        chefId,
        ...(actionType === "debit"
          ? { availableBalancePaise: { $gte: amountPaise } }
          : {}),
      },
      {
        $inc: {
          balancePaise: multiplier * amountPaise,
          availableBalancePaise: multiplier * amountPaise,
        },
      },
      { new: true }
    );

    const tx = await ChefCommissionTransaction.create({
      transactionNumber: `GKS-ADJ-${Date.now().toString().slice(-6)}`,
      chefId,
      commissionWalletId: updatedWallet._id,
      transactionType: actionType === "credit" ? "admin_credit" : "admin_debit",
      amountPaise,
      availableBalanceAfterPaise: updatedWallet.availableBalancePaise,
      reservedBalanceAfterPaise: updatedWallet.reservedBalancePaise,
      totalBalanceAfterPaise: updatedWallet.balancePaise,
      description: `Admin adjustment: ${auditReason.trim()}`,
      adminUserId,
      auditReason: auditReason.trim(),
    });

    await logAdminAction({
      adminId: adminUserId,
      actionType: "chef_wallet_adjustment",
      targetEntityType: "ChefWallet",
      targetEntityId: chefId,
      previousState: null,
      newState: { walletType: "commission", actionType, amountPaise },
      reason: `Commission wallet adjustment: ${actionType} of ₹${(amountPaise / 100).toFixed(2)}. ${auditReason.trim()}`,
    });

    return {
      success: true,
      walletType: "commission",
      actionType,
      amountPaise,
      amountRupees: amountPaise / 100,
      wallet: updatedWallet,
      transaction: tx,
    };
  } else if (walletType === "earnings") {
    let wallet = await ChefWallet.findOne({ chefId });
    if (!wallet) {
      wallet = await ChefWallet.create({
        chefId,
        pendingBalancePaise: 0,
        availableBalancePaise: 0,
        settledBalancePaise: 0,
        totalEarnedPaise: 0,
      });
    }

    if (actionType === "debit" && wallet.availableBalancePaise < amountPaise) {
      const error = new Error(
        `Insufficient chef earnings available balance. Cannot deduct ₹${(
          amountPaise / 100
        ).toFixed(2)} from available ₹${(wallet.availableBalancePaise / 100).toFixed(2)}.`
      );
      error.statusCode = 400;
      throw error;
    }

    const multiplier = actionType === "credit" ? 1 : -1;
    const updatedWallet = await ChefWallet.findOneAndUpdate(
      {
        chefId,
        ...(actionType === "debit"
          ? { availableBalancePaise: { $gte: amountPaise } }
          : {}),
      },
      {
        $inc: {
          availableBalancePaise: multiplier * amountPaise,
          ...(actionType === "credit" ? { totalEarnedPaise: amountPaise } : {}),
        },
      },
      { new: true }
    );

    await logAdminAction({
      adminId: adminUserId,
      actionType: "chef_wallet_adjustment",
      targetEntityType: "ChefWallet",
      targetEntityId: chefId,
      previousState: null,
      newState: { walletType: "earnings", actionType, amountPaise },
      reason: `Earnings wallet adjustment: ${actionType} of ₹${(amountPaise / 100).toFixed(2)}. ${auditReason.trim()}`,
    });

    return {
      success: true,
      walletType: "earnings",
      actionType,
      amountPaise,
      amountRupees: amountPaise / 100,
      wallet: updatedWallet,
      auditReason,
    };
  } else {
    const error = new Error("Invalid walletType. Expected 'commission' or 'earnings'.");
    error.statusCode = 400;
    throw error;
  }
};
