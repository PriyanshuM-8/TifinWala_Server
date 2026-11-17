import AdminWallet from "../Models/AdminWallet.js";
import AdminWalletTransaction from "../Models/AdminWalletTransaction.js";
import ChefWallet from "../Models/ChefWallet.js";
import ChefEarning from "../Models/ChefEarning.js";
import Payment from "../Models/Payment.js";
import Refund from "../Models/Refund.js";
import Order from "../Models/Order.js";
import WalletWithdrawal from "../Models/WalletWithdrawal.js";
import CustomerLoyaltyAccount from "../Models/CustomerLoyaltyAccount.js";
import RewardCoupon from "../Models/RewardCoupon.js";
import { getOrCreateAdminWallet } from "./commissionService.js";

/**
 * Helper to build createdAt date range filters.
 */
function buildDateFilter(startDate, endDate) {
  if (!startDate && !endDate) return null;
  const filter = {};
  if (startDate) filter.$gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filter.$lte = end;
  }
  return filter;
}

/**
 * ADMIN: Global Reconciled Financial Overview.
 * Adheres strictly to the immutable ledger accounting formulas without summing order totals.
 */
export async function getFinanceOverview({ startDate, endDate } = {}) {
  const dateFilter = buildDateFilter(startDate, endDate);
  const txDateQuery = dateFilter ? { createdAt: dateFilter } : {};
  const payDateQuery = dateFilter ? { createdAt: dateFilter } : {};
  const refDateQuery = dateFilter ? { createdAt: dateFilter } : {};
  const orderDateQuery = dateFilter ? { createdAt: dateFilter } : {};

  const [
    adminWallet,
    onlinePaymentsAgg,
    codCashAgg,
    refundsAgg,
    chefWalletsAgg,
    withdrawalsAgg,
    loyaltyAccountAgg,
    activeCouponsAgg,
    chefEarningsCashSettledAgg,
  ] = await Promise.all([
    getOrCreateAdminWallet(),

    // 1. Online Payment Collections: Captured online payments
    Payment.aggregate([
      { $match: { ...payDateQuery, paymentMethod: "online", status: "captured" } },
      { $group: { _id: null, totalPaise: { $sum: "$payableAmountPaise" } } },
    ]),

    // 2. COD Cash Collections: Delivered COD orders cash collected by chefs
    Order.aggregate([
      { $match: { ...orderDateQuery, paymentMethod: "cod", orderStatus: "delivered" } },
      { $group: { _id: null, totalPaise: { $sum: "$codAmountDuePaise" } } },
    ]),

    // 3. Processed Refunds
    Refund.aggregate([
      { $match: { ...refDateQuery, status: "processed" } },
      { $group: { _id: null, totalPaise: { $sum: "$amountPaise" } } },
    ]),

    // 4. Chef Wallets: Available, Pending, Settled
    ChefWallet.aggregate([
      {
        $group: {
          _id: null,
          availablePaise: { $sum: "$availableBalancePaise" },
          pendingPaise: { $sum: "$pendingBalancePaise" },
          settledPaise: { $sum: "$settledBalancePaise" },
          reservedWithdrawalPaise: { $sum: "$reservedWithdrawalBalancePaise" },
        },
      },
    ]),

    // 5. Withdrawals
    WalletWithdrawal.aggregate([
      {
        $group: {
          _id: "$status",
          totalPaise: { $sum: "$amountPaise" },
          count: { $sum: 1 },
        },
      },
    ]),

    // 6. Customer Loyalty Accounts (Unredeemed Units)
    CustomerLoyaltyAccount.aggregate([
      {
        $group: {
          _id: null,
          totalUnits: { $sum: "$balanceUnits" },
        },
      },
    ]),

    // 7. Active Reward Coupons (Already generated coupons, points deducted)
    RewardCoupon.aggregate([
      {
        $match: {
          status: "active",
          expiresAt: { $gt: new Date() },
        },
      },
      {
        $group: {
          _id: null,
          activeCount: { $sum: 1 },
        },
      },
    ]),

    // 8. Chef Earning COD cash_settled
    ChefEarning.aggregate([
      { $match: { status: "cash_settled" } },
      { $group: { _id: null, totalPaise: { $sum: "$netEarningsPaise" } } },
    ]),
  ]);

  const onlineCollectionsPaise = onlinePaymentsAgg[0]?.totalPaise || 0;
  const codCashCollectionsPaise = codCashAgg[0]?.totalPaise || 0;
  const grossCustomerCollectionsPaise = onlineCollectionsPaise + codCashCollectionsPaise;

  const commissionRevenuePaise = adminWallet.totalCommissionEarnedPaise || 0;
  const codFeeRevenuePaise = adminWallet.totalCodFeeEarnedPaise || 0;
  const grossPlatformRevenuePaise = commissionRevenuePaise + codFeeRevenuePaise;

  const promotionalDiscountExpensesPaise = adminWallet.totalPromotionalDiscountExpensePaise || 0;
  const processedRefundsPaise = refundsAgg[0]?.totalPaise || 0;

  // Estimated Razorpay gateway fee: 2% + 18% GST = ~2.36% of online collections
  const estimatedGatewayChargesPaise = Math.round(onlineCollectionsPaise * 0.0236);

  // Platform Net Operating Income = Gross Platform Revenue - Promotional Subsidies - Gateway Charges
  const netPlatformOperatingIncomePaise = Math.max(
    0,
    grossPlatformRevenuePaise - (promotionalDiscountExpensesPaise + estimatedGatewayChargesPaise)
  );

  const chefAvailablePaise = chefWalletsAgg[0]?.availablePaise || 0;
  const chefPendingPaise = chefWalletsAgg[0]?.pendingPaise || 0;
  const chefEarningsPayablePaise = chefAvailablePaise + chefPendingPaise;

  const chefSettledViaPayoutsPaise = chefWalletsAgg[0]?.settledPaise || 0;
  const chefSettledCashCodPaise = chefEarningsCashSettledAgg[0]?.totalPaise || 0;
  const chefEarningsSettledPaise = chefSettledViaPayoutsPaise + chefSettledCashCodPaise;

  // Withdrawal stats
  let pendingWithdrawalPaise = 0;
  let completedPayoutsPaise = 0;
  withdrawalsAgg.forEach((w) => {
    if (["requested", "approved", "processing"].includes(w._id)) {
      pendingWithdrawalPaise += w.totalPaise;
    } else if (["paid", "completed"].includes(w._id)) {
      completedPayoutsPaise += w.totalPaise;
    }
  });

  // Reward liabilities (strictly disjoint: unredeemed points + active coupons)
  const totalUnredeemedUnits = loyaltyAccountAgg[0]?.totalUnits || 0;
  const pointsLiabilityPaise = Math.round((totalUnredeemedUnits / 300) * 15000); // 300 units = 100 points = 1 free meal (~₹150)
  const activeCouponsCount = activeCouponsAgg[0]?.activeCount || 0;
  const couponsLiabilityPaise = activeCouponsCount * 15000;
  const totalRewardLiabilityPaise = pointsLiabilityPaise + couponsLiabilityPaise;

  return {
    // 1. Customer Collections
    collections: {
      onlinePaymentCollectionsPaise: onlineCollectionsPaise,
      onlinePaymentCollections: Number((onlineCollectionsPaise / 100).toFixed(2)),
      codCashCollectionsPaise,
      codCashCollections: Number((codCashCollectionsPaise / 100).toFixed(2)),
      grossCustomerCollectionsPaise,
      grossCustomerCollections: Number((grossCustomerCollectionsPaise / 100).toFixed(2)),
    },

    // 2. Platform Revenue & Net Operating Income
    platformRevenue: {
      commissionRevenuePaise,
      commissionRevenue: Number((commissionRevenuePaise / 100).toFixed(2)),
      codFeeRevenuePaise,
      codFeeRevenue: Number((codFeeRevenuePaise / 100).toFixed(2)),
      grossPlatformRevenuePaise,
      grossPlatformRevenue: Number((grossPlatformRevenuePaise / 100).toFixed(2)),
      promotionalDiscountExpensesPaise,
      promotionalDiscountExpenses: Number((promotionalDiscountExpensesPaise / 100).toFixed(2)),
      estimatedGatewayChargesPaise,
      estimatedGatewayCharges: Number((estimatedGatewayChargesPaise / 100).toFixed(2)),
      netPlatformOperatingIncomePaise,
      netPlatformOperatingIncome: Number((netPlatformOperatingIncomePaise / 100).toFixed(2)),
    },

    // 3. Refunds
    refunds: {
      processedRefundsPaise,
      processedRefunds: Number((processedRefundsPaise / 100).toFixed(2)),
    },

    // 4. Chef Earnings
    chefEarnings: {
      chefAvailablePaise,
      chefAvailable: Number((chefAvailablePaise / 100).toFixed(2)),
      chefPendingPaise,
      chefPending: Number((chefPendingPaise / 100).toFixed(2)),
      chefEarningsPayablePaise,
      chefEarningsPayable: Number((chefEarningsPayablePaise / 100).toFixed(2)),
      chefSettledViaPayoutsPaise,
      chefSettledViaPayouts: Number((chefSettledViaPayoutsPaise / 100).toFixed(2)),
      chefSettledCashCodPaise,
      chefSettledCashCod: Number((chefSettledCashCodPaise / 100).toFixed(2)),
      chefEarningsSettledPaise,
      chefEarningsSettled: Number((chefEarningsSettledPaise / 100).toFixed(2)),
    },

    // 5. Withdrawals
    withdrawals: {
      pendingWithdrawalPaise,
      pendingWithdrawal: Number((pendingWithdrawalPaise / 100).toFixed(2)),
      completedPayoutsPaise,
      completedPayouts: Number((completedPayoutsPaise / 100).toFixed(2)),
    },

    // 6. Reward Liabilities (Zero Double-Counting Guaranteed)
    rewardLiabilities: {
      unredeemedLoyaltyUnits: totalUnredeemedUnits,
      pointsLiabilityPaise,
      pointsLiability: Number((pointsLiabilityPaise / 100).toFixed(2)),
      activeCouponsCount,
      couponsLiabilityPaise,
      couponsLiability: Number((couponsLiabilityPaise / 100).toFixed(2)),
      totalRewardLiabilityPaise,
      totalRewardLiability: Number((totalRewardLiabilityPaise / 100).toFixed(2)),
    },
  };
}

/**
 * ADMIN: Paginated Admin Wallet Transactions.
 */
export async function getFinanceTransactions({
  transactionType,
  startDate,
  endDate,
  page = 1,
  limit = 20,
}) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = {};
  if (transactionType) query.transactionType = transactionType;

  const dateFilter = buildDateFilter(startDate, endDate);
  if (dateFilter) query.createdAt = dateFilter;

  const [totalRecords, transactions] = await Promise.all([
    AdminWalletTransaction.countDocuments(query),
    AdminWalletTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("chefId", "name email")
      .populate("orderId", "orderNumber totalAmount deliveryType")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    transactions,
  };
}

/**
 * ADMIN: Commission transactions breakdown.
 */
export async function getCommissionBreakdown({ startDate, endDate, page = 1, limit = 20 }) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = {
    transactionType: { $in: ["commission_credit", "commission_reversal"] },
  };
  const dateFilter = buildDateFilter(startDate, endDate);
  if (dateFilter) query.createdAt = dateFilter;

  const [totalRecords, transactions] = await Promise.all([
    AdminWalletTransaction.countDocuments(query),
    AdminWalletTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("chefId", "name email")
      .populate("orderId", "orderNumber totalAmount")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    transactions,
  };
}

/**
 * ADMIN: COD fee transactions breakdown.
 */
export async function getCodFeeBreakdown({ startDate, endDate, page = 1, limit = 20 }) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = {
    transactionType: { $in: ["cod_fee_credit", "cod_fee_reversal"] },
  };
  const dateFilter = buildDateFilter(startDate, endDate);
  if (dateFilter) query.createdAt = dateFilter;

  const [totalRecords, transactions] = await Promise.all([
    AdminWalletTransaction.countDocuments(query),
    AdminWalletTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("chefId", "name email")
      .populate("orderId", "orderNumber totalAmount")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    transactions,
  };
}

/**
 * ADMIN: Online payments captured breakdown.
 */
export async function getOnlinePaymentsBreakdown({ startDate, endDate, page = 1, limit = 20 }) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = {
    paymentMethod: "online",
    status: "captured",
  };
  const dateFilter = buildDateFilter(startDate, endDate);
  if (dateFilter) query.createdAt = dateFilter;

  const [totalRecords, payments] = await Promise.all([
    Payment.countDocuments(query),
    Payment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("customerId", "name email phone")
      .populate("chefId", "name email")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    payments,
  };
}

/**
 * ADMIN: Promotional expenses breakdown.
 */
export async function getPromotionalExpensesBreakdown({ startDate, endDate, page = 1, limit = 20 }) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = { transactionType: "promotional_discount_expense" };
  const dateFilter = buildDateFilter(startDate, endDate);
  if (dateFilter) query.createdAt = dateFilter;

  const [totalRecords, transactions] = await Promise.all([
    AdminWalletTransaction.countDocuments(query),
    AdminWalletTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("orderId", "orderNumber totalAmount onlineDiscountPaise")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    transactions,
  };
}

/**
 * ADMIN: List all platform refunds with status, type, and order reference.
 */
export async function listAllRefunds({ status, refundType, startDate, endDate, page = 1, limit = 20 }) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = {};
  if (status) query.status = status;
  if (refundType) query.refundType = refundType;

  const dateFilter = buildDateFilter(startDate, endDate);
  if (dateFilter) query.createdAt = dateFilter;

  const [totalRecords, refunds] = await Promise.all([
    Refund.countDocuments(query),
    Refund.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("customerId", "name email phone")
      .populate("chefId", "name email")
      .populate("orderId", "orderNumber totalAmount paymentMethod")
      .populate("paymentId", "paymentNumber payableAmountPaise")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    refunds,
  };
}

/**
 * ADMIN: Get detailed refund record with gateway refund ID and clawback tracking.
 */
export async function getRefundDetails(refundId) {
  const refund = await Refund.findById(refundId)
    .populate("customerId", "name email phone")
    .populate("chefId", "name email")
    .populate("orderId")
    .populate("paymentId")
    .lean();

  if (!refund) {
    const error = new Error("Refund record not found.");
    error.statusCode = 404;
    throw error;
  }

  return refund;
}
