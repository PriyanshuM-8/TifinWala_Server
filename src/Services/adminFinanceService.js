import crypto from "crypto";
import AdminWallet from "../Models/AdminWallet.js";
import AdminWalletTransaction from "../Models/AdminWalletTransaction.js";
import ChefWallet from "../Models/ChefWallet.js";
import ChefEarning from "../Models/ChefEarning.js";
import ChefOrderSequence from "../Models/ChefOrderSequence.js";
import Payment from "../Models/Payment.js";
import Refund from "../Models/Refund.js";
import Order from "../Models/Order.js";
import WalletWithdrawal from "../Models/WalletWithdrawal.js";
import CustomerLoyaltyAccount from "../Models/CustomerLoyaltyAccount.js";
import RewardCoupon from "../Models/RewardCoupon.js";
import { getOrCreateAdminWallet } from "./commissionService.js";

const generateTxNumber = (prefix = "ADM") =>
  `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

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
    adminTxAgg,
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

    // 9. Admin Wallet Transaction Ledger within time boundary
    AdminWalletTransaction.aggregate([
      { $match: txDateQuery },
      {
        $group: {
          _id: "$transactionType",
          totalPaise: { $sum: "$amountPaise" },
        },
      },
    ]),
  ]);

  const onlineCollectionsPaise = onlinePaymentsAgg[0]?.totalPaise || 0;
  const codCashCollectionsPaise = codCashAgg[0]?.totalPaise || 0;
  const grossCustomerCollectionsPaise = onlineCollectionsPaise + codCashCollectionsPaise;

  // Ledger Revenue Calculations
  let commissionRevenuePaise = adminWallet.totalCommissionEarnedPaise || 0;
  let codFeeRevenuePaise = adminWallet.totalCodFeeEarnedPaise || 0;
  let promotionalDiscountExpensesPaise = adminWallet.totalPromotionalDiscountExpensePaise || 0;

  if (dateFilter) {
    commissionRevenuePaise = 0;
    codFeeRevenuePaise = 0;
    promotionalDiscountExpensesPaise = 0;

    adminTxAgg.forEach((item) => {
      if (item._id === "commission_credit") commissionRevenuePaise += item.totalPaise;
      if (item._id === "commission_reversal") commissionRevenuePaise -= item.totalPaise;
      if (item._id === "cod_fee_credit") codFeeRevenuePaise += item.totalPaise;
      if (item._id === "cod_fee_reversal") codFeeRevenuePaise -= item.totalPaise;
      if (item._id === "promotional_discount_expense") promotionalDiscountExpensesPaise += item.totalPaise;
    });

    commissionRevenuePaise = Math.max(0, commissionRevenuePaise);
    codFeeRevenuePaise = Math.max(0, codFeeRevenuePaise);
    promotionalDiscountExpensesPaise = Math.max(0, promotionalDiscountExpensesPaise);
  }

  const grossPlatformRevenuePaise = commissionRevenuePaise + codFeeRevenuePaise;
  const processedRefundsPaise = refundsAgg[0]?.totalPaise || 0;

  // Estimated Razorpay gateway fee: 2% + 18% GST = ~2.36% of online collections
  const estimatedGatewayChargesPaise = Math.round(onlineCollectionsPaise * 0.0236);

  // Platform Operating Expenses = Promotional Discounts + Gateway Charges + Processed Refunds
  const totalPlatformExpensesPaise = promotionalDiscountExpensesPaise + estimatedGatewayChargesPaise + processedRefundsPaise;

  // Platform Net Operating Income = Gross Platform Revenue - Platform Expenses
  const netPlatformOperatingIncomePaise = Math.max(
    0,
    grossPlatformRevenuePaise - totalPlatformExpensesPaise
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

    // 3. Platform Operating Expenses (Detailed Disclosures)
    platformExpenses: {
      promotionalDiscountExpensesPaise,
      promotionalDiscountExpenses: Number((promotionalDiscountExpensesPaise / 100).toFixed(2)),
      estimatedGatewayChargesPaise,
      estimatedGatewayCharges: Number((estimatedGatewayChargesPaise / 100).toFixed(2)),
      processedRefundsPaise,
      processedRefunds: Number((processedRefundsPaise / 100).toFixed(2)),
      totalPlatformExpensesPaise,
      totalPlatformExpenses: Number((totalPlatformExpensesPaise / 100).toFixed(2)),
    },

    // 4. Refunds
    refunds: {
      processedRefundsPaise,
      processedRefunds: Number((processedRefundsPaise / 100).toFixed(2)),
    },

    // 5. Chef Earnings
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

    // 6. Withdrawals
    withdrawals: {
      pendingWithdrawalPaise,
      pendingWithdrawal: Number((pendingWithdrawalPaise / 100).toFixed(2)),
      completedPayoutsPaise,
      completedPayouts: Number((completedPayoutsPaise / 100).toFixed(2)),
    },

    // 7. Reward Liabilities (Zero Double-Counting Guaranteed)
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

/**
 * ADMIN: Financial time-series analytics for revenue, margins, collections, and payment distribution.
 */
export async function getFinanceAnalytics({ days = 30, startDate, endDate } = {}) {
  let start, end;
  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
  } else {
    end = new Date();
    start = new Date();
    start.setDate(start.getDate() - (parseInt(days, 10) || 30));
    start.setHours(0, 0, 0, 0);
  }

  const [txTimeline, orderTimeline, chefEarningTimeline, paymentDistribution] = await Promise.all([
    // Daily ledger transactions
    AdminWalletTransaction.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            type: "$transactionType",
          },
          amountPaise: { $sum: "$amountPaise" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]),

    // Daily gross orders & collections
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          orderStatus: { $ne: "cancelled" },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          grossCollectionsPaise: { $sum: "$totalAmountPaise" },
          onlineCollectionsPaise: {
            $sum: { $cond: [{ $eq: ["$paymentMethod", "online"] }, "$totalAmountPaise", 0] },
          },
          codCollectionsPaise: {
            $sum: { $cond: [{ $eq: ["$paymentMethod", "cod"] }, "$totalAmountPaise", 0] },
          },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Daily Chef net earnings
    ChefEarning.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          netEarningsPaise: { $sum: "$netEarningsPaise" },
          commissionPaise: { $sum: "$commissionDeductedPaise" },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Payment method distribution
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          orderStatus: { $ne: "cancelled" },
        },
      },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          totalPaise: { $sum: "$totalAmountPaise" },
        },
      },
    ]),
  ]);

  // Consolidate daily maps
  const dateMap = {};

  // Initialize dates between start and end
  const cur = new Date(start);
  while (cur <= end) {
    const key = cur.toISOString().split("T")[0];
    dateMap[key] = {
      date: key,
      grossRevenue: 0,
      platformCommission: 0,
      chefPayouts: 0,
      commissionRevenue: 0,
      codFeeRevenue: 0,
      promotionalExpenses: 0,
      refunds: 0,
      netRevenue: 0,
      orderCount: 0,
    };
    cur.setDate(cur.getDate() + 1);
  }

  // Populate from orderTimeline
  orderTimeline.forEach((o) => {
    if (dateMap[o._id]) {
      dateMap[o._id].grossRevenue = Number((o.grossCollectionsPaise / 100).toFixed(2));
      dateMap[o._id].orderCount = o.orderCount;
    }
  });

  // Populate from chefEarningTimeline
  chefEarningTimeline.forEach((c) => {
    if (dateMap[c._id]) {
      dateMap[c._id].chefPayouts = Number((c.netEarningsPaise / 100).toFixed(2));
    }
  });

  // Populate from txTimeline
  txTimeline.forEach((t) => {
    const date = t._id.date;
    const type = t._id.type;
    const amountRupees = Number((t.amountPaise / 100).toFixed(2));

    if (dateMap[date]) {
      if (type === "commission_credit") {
        dateMap[date].commissionRevenue += amountRupees;
      } else if (type === "commission_reversal") {
        dateMap[date].commissionRevenue -= amountRupees;
      } else if (type === "cod_fee_credit") {
        dateMap[date].codFeeRevenue += amountRupees;
      } else if (type === "cod_fee_reversal") {
        dateMap[date].codFeeRevenue -= amountRupees;
      } else if (type === "promotional_discount_expense") {
        dateMap[date].promotionalExpenses += amountRupees;
      } else if (type === "refund_debit") {
        dateMap[date].refunds += amountRupees;
      }
    }
  });

  // Calculate platform totals per day
  const timeline = Object.values(dateMap).map((d) => {
    const comm = Math.max(0, Number(d.commissionRevenue.toFixed(2)));
    const cod = Math.max(0, Number(d.codFeeRevenue.toFixed(2)));
    const disc = Number(d.promotionalExpenses.toFixed(2));
    const ref = Number(d.refunds.toFixed(2));
    const grossComm = Number((comm + cod).toFixed(2));
    const net = Number(Math.max(0, grossComm - disc - ref).toFixed(2));

    return {
      ...d,
      commissionRevenue: comm,
      codFeeRevenue: cod,
      platformCommission: grossComm, // For RevenueAnalyticsChart
      promotionalExpenses: disc,
      refunds: ref,
      netRevenue: net,
    };
  });

  return {
    period: { start: start.toISOString(), end: end.toISOString() },
    timeline,
    paymentDistribution: paymentDistribution.map((p) => ({
      _id: p._id,
      count: p.count,
      total: Number((p.totalPaise / 100).toFixed(2)),
    })),
  };
}

/**
 * ADMIN: Idempotent Ledger Backfill and Reconciliation.
 * Reconciles historical delivered orders, creates missing AdminWalletTransaction entries,
 * and synchronizes AdminWallet totals.
 */
export async function reconcileAndBackfillAdminLedger() {
  const adminWallet = await getOrCreateAdminWallet();

  const deliveredOrders = await Order.find({ orderStatus: "delivered" })
    .sort({ createdAt: 1 })
    .lean();

  let backfilledOnlineCommissions = 0;
  let backfilledOnlineDiscounts = 0;
  let backfilledCodCommissions = 0;
  let backfilledCodFees = 0;
  let alreadyPresentTransactions = 0;

  for (const order of deliveredOrders) {
    const chefId = order.chefId;
    const foodPaise = order.subtotalPaise || Math.round((order.subtotal || 0) * 100);
    const subsidyPaise = order.onlineDiscountPaise || 0;
    const codFeePaise = order.codFeePaise || 0;

    // Determine actual commission (check existing chef earning or sequence)
    let commissionPaise = 0;
    const existingChefEarning = await ChefEarning.findOne({ orderId: order._id }).lean();
    if (existingChefEarning && existingChefEarning.commissionDeductedPaise !== undefined) {
      commissionPaise = existingChefEarning.commissionDeductedPaise;
    } else {
      const sequence = await ChefOrderSequence.findOne({ chefId }).lean();
      const isFirstOrder = sequence && sequence.firstOrderId && sequence.firstOrderId.toString() === order._id.toString();
      if (!isFirstOrder) {
        commissionPaise = Math.round(foodPaise * 0.10);
      }
    }

    const orderTime = order.deliveredAt || order.updatedAt || order.createdAt;

    if (order.paymentMethod === "online") {
      // 1. Commission Credit
      if (commissionPaise > 0) {
        const idempKey = `adm_onl_comm_${order._id.toString()}`;
        const existingTx = await AdminWalletTransaction.findOne({ idempotencyKey: idempKey });
        if (!existingTx) {
          const tx = new AdminWalletTransaction({
            transactionNumber: generateTxNumber("ADM-COMM"),
            adminWalletId: adminWallet._id,
            chefId,
            transactionType: "commission_credit",
            amountPaise: commissionPaise,
            balanceAfterPaise: adminWallet.availableBalancePaise + commissionPaise,
            orderId: order._id,
            description: `Commission earned from delivered online order ${order.orderNumber}`,
            idempotencyKey: idempKey,
            createdAt: orderTime,
          });
          await tx.save();
          backfilledOnlineCommissions++;
        } else {
          alreadyPresentTransactions++;
        }
      }

      // 2. Promotional Discount Expense
      if (subsidyPaise > 0) {
        const discKey = `adm_onl_disc_${order._id.toString()}`;
        const existingDiscTx = await AdminWalletTransaction.findOne({ idempotencyKey: discKey });
        if (!existingDiscTx) {
          const tx = new AdminWalletTransaction({
            transactionNumber: generateTxNumber("ADM-DISC"),
            adminWalletId: adminWallet._id,
            chefId,
            transactionType: "promotional_discount_expense",
            amountPaise: subsidyPaise,
            balanceAfterPaise: adminWallet.availableBalancePaise,
            orderId: order._id,
            description: `Platform promotional discount expense for online order ${order.orderNumber}`,
            idempotencyKey: discKey,
            createdAt: orderTime,
          });
          await tx.save();
          backfilledOnlineDiscounts++;
        } else {
          alreadyPresentTransactions++;
        }
      }
    } else if (order.paymentMethod === "cod") {
      // 1. COD Commission Credit
      if (commissionPaise > 0) {
        const codCommKey = `adm_cod_comm_${order._id.toString()}`;
        const existingCodTx = await AdminWalletTransaction.findOne({ idempotencyKey: codCommKey });
        if (!existingCodTx) {
          const tx = new AdminWalletTransaction({
            transactionNumber: generateTxNumber("ADM-CC"),
            adminWalletId: adminWallet._id,
            chefId,
            transactionType: "commission_credit",
            amountPaise: commissionPaise,
            balanceAfterPaise: adminWallet.availableBalancePaise + commissionPaise,
            orderId: order._id,
            description: `Commission earned from COD order ${order.orderNumber}`,
            idempotencyKey: codCommKey,
            createdAt: orderTime,
          });
          await tx.save();
          backfilledCodCommissions++;
        } else {
          alreadyPresentTransactions++;
        }
      }

      // 2. COD Fee Credit
      const feeToCredit = codFeePaise > 0 ? codFeePaise : 2000;
      const codFeeKey = `adm_cod_fee_${order._id.toString()}`;
      const existingFeeTx = await AdminWalletTransaction.findOne({ idempotencyKey: codFeeKey });
      if (!existingFeeTx) {
        const tx = new AdminWalletTransaction({
          transactionNumber: generateTxNumber("ADM-CF"),
          adminWalletId: adminWallet._id,
          chefId,
          transactionType: "cod_fee_credit",
          amountPaise: feeToCredit,
          balanceAfterPaise: adminWallet.availableBalancePaise + feeToCredit,
          orderId: order._id,
          description: `COD fee earned from COD order ${order.orderNumber}`,
          idempotencyKey: codFeeKey,
          createdAt: orderTime,
        });
        await tx.save();
        backfilledCodFees++;
      } else {
        alreadyPresentTransactions++;
      }
    }

    if (order.settlementStatus !== "settled") {
      await Order.findByIdAndUpdate(order._id, {
        settlementStatus: "settled",
        settledAt: orderTime,
      });
    }
  }

  // Recalculate and reconcile AdminWallet exact totals from transaction ledger
  const ledgerTotals = await AdminWalletTransaction.aggregate([
    {
      $group: {
        _id: "$transactionType",
        total: { $sum: "$amountPaise" },
      },
    },
  ]);

  let totalComm = 0;
  let totalCod = 0;
  let totalDisc = 0;
  let totalRefundDebits = 0;

  for (const item of ledgerTotals) {
    if (item._id === "commission_credit") totalComm += item.total;
    if (item._id === "commission_reversal") totalComm -= item.total;
    if (item._id === "cod_fee_credit") totalCod += item.total;
    if (item._id === "cod_fee_reversal") totalCod -= item.total;
    if (item._id === "promotional_discount_expense") totalDisc += item.total;
    if (item._id === "refund_debit") totalRefundDebits += item.total;
  }

  adminWallet.totalCommissionEarnedPaise = Math.max(0, totalComm);
  adminWallet.totalCodFeeEarnedPaise = Math.max(0, totalCod);
  adminWallet.totalPromotionalDiscountExpensePaise = Math.max(0, totalDisc);
  adminWallet.availableBalancePaise = Math.max(0, totalComm + totalCod - totalRefundDebits);
  adminWallet.settledBalancePaise = adminWallet.availableBalancePaise;
  await adminWallet.save();

  return {
    deliveredOrdersScanned: deliveredOrders.length,
    backfilledOnlineCommissions,
    backfilledOnlineDiscounts,
    backfilledCodCommissions,
    backfilledCodFees,
    alreadyPresentTransactions,
    reconciledWallet: {
      totalCommissionEarnedPaise: adminWallet.totalCommissionEarnedPaise,
      totalCommissionEarned: Number((adminWallet.totalCommissionEarnedPaise / 100).toFixed(2)),
      totalCodFeeEarnedPaise: adminWallet.totalCodFeeEarnedPaise,
      totalCodFeeEarned: Number((adminWallet.totalCodFeeEarnedPaise / 100).toFixed(2)),
      totalPromotionalDiscountExpensePaise: adminWallet.totalPromotionalDiscountExpensePaise,
      totalPromotionalDiscountExpense: Number((adminWallet.totalPromotionalDiscountExpensePaise / 100).toFixed(2)),
      availableBalancePaise: adminWallet.availableBalancePaise,
      availableBalance: Number((adminWallet.availableBalancePaise / 100).toFixed(2)),
    },
  };
}
