import AdminWallet from "../Models/AdminWallet.js";
import AdminWalletTransaction from "../Models/AdminWalletTransaction.js";
import Payment from "../Models/Payment.js";
import Refund from "../Models/Refund.js";
import Order from "../Models/Order.js";
import ChefWallet from "../Models/ChefWallet.js";
import ChefCommissionWallet from "../Models/ChefCommissionWallet.js";
import WalletWithdrawal from "../Models/WalletWithdrawal.js";
import AdminWithdrawal from "../Models/AdminWithdrawal.js";
import { getOrCreateAdminWallet } from "./commissionService.js";

const OPERATING_BUFFER_PAISE = 50000; // ₹500 minimum liquidity buffer

/**
 * ADMIN: Reconciles all platform cash inflows, outflows, escrow liabilities,
 * and accounting revenue to calculate the actual withdrawable cash balance.
 */
export async function getTreasuryOverview() {
  const [
    adminWallet,
    onlineCustomerPaymentsAgg,
    subscriptionPaymentsAgg,
    commissionRechargesAgg,
    codOrdersDeliveredAgg,
    processedRefundsAgg,
    chefWalletsAgg,
    chefCommissionWalletsAgg,
    chefPaidWithdrawalsAgg,
    adminWithdrawalsAgg,
  ] = await Promise.all([
    getOrCreateAdminWallet(),

    // 1. Online Instant Order Collections (captured)
    Payment.aggregate([
      {
        $match: {
          orderType: "instant_order",
          paymentMethod: "online",
          status: "captured",
        },
      },
      { $group: { _id: null, totalPaise: { $sum: "$payableAmountPaise" } } },
    ]),

    // 2. Subscription Collections (captured)
    Payment.aggregate([
      {
        $match: {
          orderType: "subscription",
          status: "captured",
        },
      },
      { $group: { _id: null, totalPaise: { $sum: "$payableAmountPaise" } } },
    ]),

    // 3. Chef Commission Wallet Recharges (captured cash inflow into gateway)
    Payment.aggregate([
      {
        $match: {
          orderType: "commission_recharge",
          status: "captured",
        },
      },
      { $group: { _id: null, totalPaise: { $sum: "$payableAmountPaise" } } },
    ]),

    // 4. Delivered COD Orders Cash (collected by chefs, not platform bank)
    Order.aggregate([
      {
        $match: {
          paymentMethod: "cod",
          orderStatus: "delivered",
        },
      },
      { $group: { _id: null, totalPaise: { $sum: "$codAmountDuePaise" } } },
    ]),

    // 5. Processed Refunds from Gateway (segregated by refundType)
    Refund.aggregate([
      { $match: { status: "processed" } },
      { $group: { _id: "$refundType", totalPaise: { $sum: "$amountPaise" } } },
    ]),

    // 6. Chef Wallets: Available, Pending, Reserved
    ChefWallet.aggregate([
      {
        $group: {
          _id: null,
          availablePaise: { $sum: "$availableBalancePaise" },
          pendingPaise: { $sum: "$pendingBalancePaise" },
          reservedWithdrawalPaise: { $sum: "$reservedWithdrawalBalancePaise" },
        },
      },
    ]),

    // 7. Chef Commission Wallets: Unconsumed advance deposits
    ChefCommissionWallet.aggregate([
      {
        $group: {
          _id: null,
          availableDepositPaise: { $sum: "$availableBalancePaise" },
        },
      },
    ]),

    // 8. Completed Chef Payouts
    WalletWithdrawal.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, totalPaise: { $sum: "$amountPaise" } } },
    ]),

    // 9. Admin Withdrawals by Status
    AdminWithdrawal.aggregate([
      {
        $group: {
          _id: "$status",
          totalPaise: { $sum: "$amountPaise" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Inflow Totals
  const onlineOrderCollectionsPaise = onlineCustomerPaymentsAgg[0]?.totalPaise || 0;
  const subscriptionCollectionsPaise = subscriptionPaymentsAgg[0]?.totalPaise || 0;
  const chefRechargeCollectionsPaise = commissionRechargesAgg[0]?.totalPaise || 0;
  const totalSettledGatewayInflowsPaise =
    onlineOrderCollectionsPaise + subscriptionCollectionsPaise + chefRechargeCollectionsPaise;

  const codChefsCashCollectedPaise = codOrdersDeliveredAgg[0]?.totalPaise || 0;

  // Outflow Totals
  let totalProcessedRefundsPaise = 0;
  let processedDisputeLossPaise = 0;
  processedRefundsAgg.forEach((r) => {
    totalProcessedRefundsPaise += r.totalPaise;
    if (r._id === "order_dispute") {
      processedDisputeLossPaise += r.totalPaise;
    }
  });

  const chefPaidWithdrawalsPaise = chefPaidWithdrawalsAgg[0]?.totalPaise || 0;

  // Estimated Razorpay gateway charges (2% + 18% GST = 2.36% on customer online collections)
  const estimatedGatewayChargesPaise = Math.round(
    (onlineOrderCollectionsPaise + subscriptionCollectionsPaise) * 0.0236
  );

  // Admin Withdrawals Segregation
  let completedAdminWithdrawalsPaise = 0;
  let pendingAdminWithdrawalsPaise = 0;

  adminWithdrawalsAgg.forEach((w) => {
    if (w._id === "successful") {
      completedAdminWithdrawalsPaise += w.totalPaise;
    } else if (["pending", "processing"].includes(w._id)) {
      pendingAdminWithdrawalsPaise += w.totalPaise;
    }
  });

  // Current Liquid Treasury Funds held in Bank / Payment Gateway
  const grossLiquidTreasuryPaise = Math.max(
    0,
    totalSettledGatewayInflowsPaise -
      estimatedGatewayChargesPaise -
      totalProcessedRefundsPaise -
      chefPaidWithdrawalsPaise -
      completedAdminWithdrawalsPaise
  );

  // Third-Party Escrow & Custodial Liabilities
  const chefAvailableEarningsPaise = chefWalletsAgg[0]?.availablePaise || 0;
  const chefPendingEarningsPaise = chefWalletsAgg[0]?.pendingPaise || 0;
  const chefReservedWithdrawalsPaise = chefWalletsAgg[0]?.reservedWithdrawalPaise || 0;
  const chefTotalEscrowLiabilityPaise =
    chefAvailableEarningsPaise + chefPendingEarningsPaise + chefReservedWithdrawalsPaise;

  // Unconsumed Chef Commission Deposits
  const unconsumedChefDepositsPaise = chefCommissionWalletsAgg[0]?.availableDepositPaise || 0;

  // Total Platform Liabilities
  const totalLiabilitiesPaise =
    chefTotalEscrowLiabilityPaise +
    unconsumedChefDepositsPaise +
    OPERATING_BUFFER_PAISE;

  // 1. Treasury Cash Available Ceiling
  const treasuryAvailableCashPaise = Math.max(
    0,
    grossLiquidTreasuryPaise - totalLiabilitiesPaise - pendingAdminWithdrawalsPaise
  );

  // 2. Accounting Realized Net Revenue Ceiling
  const commissionRevenuePaise = adminWallet.totalCommissionEarnedPaise || 0;
  const codFeeRevenuePaise = adminWallet.totalCodFeeEarnedPaise || 0;
  const grossAccountingRevenuePaise = commissionRevenuePaise + codFeeRevenuePaise;
  const promotionalExpensesPaise = adminWallet.totalPromotionalDiscountExpensePaise || 0;

  const netRealizedAccountingEarningsPaise = Math.max(
    0,
    grossAccountingRevenuePaise -
      promotionalExpensesPaise -
      estimatedGatewayChargesPaise -
      processedDisputeLossPaise
  );

  const accountingAvailablePaise = Math.max(
    0,
    netRealizedAccountingEarningsPaise -
      completedAdminWithdrawalsPaise -
      pendingAdminWithdrawalsPaise
  );

  // Dual-ceiling Available Withdrawal Balance
  const availableWithdrawalBalancePaise = Math.min(
    treasuryAvailableCashPaise,
    accountingAvailablePaise
  );

  return {
    // 1. Reconciled Available Withdrawal Balance
    availableWithdrawalBalancePaise,
    availableWithdrawalBalanceRupees: Number((availableWithdrawalBalancePaise / 100).toFixed(2)),

    // 2. Liquid Treasury Funds & Inflow/Outflows
    liquidTreasury: {
      totalSettledGatewayInflowsPaise,
      totalSettledGatewayInflowsRupees: Number((totalSettledGatewayInflowsPaise / 100).toFixed(2)),
      onlineOrderCollectionsPaise,
      onlineOrderCollectionsRupees: Number((onlineOrderCollectionsPaise / 100).toFixed(2)),
      subscriptionCollectionsPaise,
      subscriptionCollectionsRupees: Number((subscriptionCollectionsPaise / 100).toFixed(2)),
      chefRechargeCollectionsPaise,
      chefRechargeCollectionsRupees: Number((chefRechargeCollectionsPaise / 100).toFixed(2)),
      codChefsCashCollectedPaise,
      codChefsCashCollectedRupees: Number((codChefsCashCollectedPaise / 100).toFixed(2)),
      grossLiquidTreasuryPaise,
      grossLiquidTreasuryRupees: Number((grossLiquidTreasuryPaise / 100).toFixed(2)),
    },

    // 3. Platform Operating Expenses & Outflows
    expensesAndOutflows: {
      estimatedGatewayChargesPaise,
      estimatedGatewayChargesRupees: Number((estimatedGatewayChargesPaise / 100).toFixed(2)),
      totalProcessedRefundsPaise,
      totalProcessedRefundsRupees: Number((totalProcessedRefundsPaise / 100).toFixed(2)),
      processedDisputeLossPaise,
      processedDisputeLossRupees: Number((processedDisputeLossPaise / 100).toFixed(2)),
      promotionalExpensesPaise,
      promotionalExpensesRupees: Number((promotionalExpensesPaise / 100).toFixed(2)),
      chefPaidWithdrawalsPaise,
      chefPaidWithdrawalsRupees: Number((chefPaidWithdrawalsPaise / 100).toFixed(2)),
    },

    // 4. Custodial & Escrow Liabilities
    liabilities: {
      chefAvailableEarningsPaise,
      chefAvailableEarningsRupees: Number((chefAvailableEarningsPaise / 100).toFixed(2)),
      chefPendingEarningsPaise,
      chefPendingEarningsRupees: Number((chefPendingEarningsRupi(chefPendingEarningsPaise))),
      chefReservedWithdrawalsPaise,
      chefReservedWithdrawalsRupees: Number((chefReservedWithdrawalsPaise / 100).toFixed(2)),
      chefTotalEscrowLiabilityPaise,
      chefTotalEscrowLiabilityRupees: Number((chefTotalEscrowLiabilityPaise / 100).toFixed(2)),
      unconsumedChefDepositsPaise,
      unconsumedChefDepositsRupees: Number((unconsumedChefDepositsPaise / 100).toFixed(2)),
      operatingBufferPaise: OPERATING_BUFFER_PAISE,
      operatingBufferRupees: OPERATING_BUFFER_PAISE / 100,
      totalLiabilitiesPaise,
      totalLiabilitiesRupees: Number((totalLiabilitiesPaise / 100).toFixed(2)),
    },

    // 5. Admin Withdrawals Status
    withdrawals: {
      completedAdminWithdrawalsPaise,
      completedAdminWithdrawalsRupees: Number((completedAdminWithdrawalsPaise / 100).toFixed(2)),
      pendingAdminWithdrawalsPaise,
      pendingAdminWithdrawalsRupees: Number((pendingAdminWithdrawalsPaise / 100).toFixed(2)),
    },

    // 6. Accounting Realized Revenue vs Ceilings
    accounting: {
      commissionRevenuePaise,
      commissionRevenueRupees: Number((commissionRevenuePaise / 100).toFixed(2)),
      codFeeRevenuePaise,
      codFeeRevenueRupees: Number((codFeeRevenuePaise / 100).toFixed(2)),
      grossAccountingRevenuePaise,
      grossAccountingRevenueRupees: Number((grossAccountingRevenuePaise / 100).toFixed(2)),
      netRealizedAccountingEarningsPaise,
      netRealizedAccountingEarningsRupees: Number((netRealizedAccountingEarningsPaise / 100).toFixed(2)),
      treasuryCeilingPaise: treasuryAvailableCashPaise,
      treasuryCeilingRupees: Number((treasuryAvailableCashPaise / 100).toFixed(2)),
      accountingCeilingPaise: accountingAvailablePaise,
      accountingCeilingRupees: Number((accountingAvailablePaise / 100).toFixed(2)),
    },
  };
}

function chefPendingEarningsRupi(paise) {
  return Number(((paise || 0) / 100).toFixed(2));
}
