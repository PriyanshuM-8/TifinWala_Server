import crypto from "crypto";
import ChefWallet from "../Models/ChefWallet.js";
import ChefEarning from "../Models/ChefEarning.js";
import ChefProfile from "../Models/ChefProfile.js";
import Order from "../Models/Order.js";
import ChefCommissionWallet from "../Models/ChefCommissionWallet.js";
import ChefCommissionTransaction from "../Models/ChefCommissionTransaction.js";
import ChefOrderSequence from "../Models/ChefOrderSequence.js";
import { settleOnlineOrderDelivery } from "./onlineSettlementService.js";
import { captureCodOrderCommissionAndFee } from "./codSettlementService.js";

/**
 * Generate unique earning number e.g. GKS-ERN-XXXXXX
 */
const generateEarningNumber = () => {
  return `GKS-ERN-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

/**
 * Helper to resolve canonical User ID and all matching IDs
 */
const getChefIdentityIds = async (chefId) => {
  let canonicalId = chefId;
  const possibleIds = [chefId];
  try {
    const profile = await ChefProfile.findOne({
      $or: [{ userId: chefId }, { _id: chefId }],
    });
    if (profile) {
      if (profile.userId) {
        canonicalId = profile.userId;
        if (!possibleIds.some((id) => id.toString() === profile.userId.toString())) {
          possibleIds.push(profile.userId);
        }
      }
      if (profile._id && !possibleIds.some((id) => id.toString() === profile._id.toString())) {
        possibleIds.push(profile._id);
      }
    }
  } catch (err) {
    // Non-blocking
  }
  return { canonicalId, possibleIds };
};

const resolveChefIds = async (chefId) => {
  const { possibleIds } = await getChefIdentityIds(chefId);
  return possibleIds;
};

/**
 * Ensures ChefWallet exists.
 */
export const getOrCreateChefWallet = async (chefId) => {
  const { canonicalId, possibleIds } = await getChefIdentityIds(chefId);

  let wallet = await ChefWallet.findOne({ chefId: { $in: possibleIds } });
  if (!wallet) {
    wallet = await ChefWallet.create({
      chefId: canonicalId,
      pendingBalancePaise: 0,
      availableBalancePaise: 0,
      settledBalancePaise: 0,
      totalEarnedPaise: 0,
    });
  } else if (wallet.chefId.toString() !== canonicalId.toString()) {
    wallet.chefId = canonicalId;
    await wallet.save();
  }
  return wallet;
};

/**
 * Records a pending earning for a chef upon order or meal acceptance.
 */
export const recordPendingChefEarning = async ({
  chefId,
  sourceType,
  orderId,
  subscriptionMealOrderId,
  subscriptionId,
  redemptionId,
  orderNumber,
  grossAmountPaise,
  commissionDeductedPaise = 0,
  foodDetails = [],
  earningDateKey,
}) => {
  const refId =
    orderId ||
    subscriptionMealOrderId ||
    (redemptionId ? (orderNumber ? `${redemptionId}_${orderNumber}` : redemptionId) : null);
  const idempotencyKey = `PENDING_EARNING_${refId}`;

  // Check idempotency
  let earning = await ChefEarning.findOne({ idempotencyKey });
  if (earning) {
    return earning;
  }

  // Ensure wallet exists
  await getOrCreateChefWallet(chefId);

  earning = await ChefEarning.create({
    earningNumber: generateEarningNumber(),
    chefId,
    sourceType,
    orderId,
    subscriptionMealOrderId,
    subscriptionId,
    redemptionId,
    orderNumber,
    grossAmountPaise,
    netEarningsPaise: grossAmountPaise, // In Phase 9, gross equals net before commission capture
    commissionDeductedPaise,
    status: "pending",
    foodDetails,
    earningDateKey,
    idempotencyKey,
  });

  // Increment pending balance in ChefWallet
  await ChefWallet.findOneAndUpdate(
    { chefId },
    { $inc: { pendingBalancePaise: grossAmountPaise } },
    { new: true, upsert: true }
  );

  return earning;
};

/**
 * Confirms a pending chef earning upon successful delivery (pending -> available).
 */
export const confirmChefEarning = async ({
  chefId,
  orderId,
  subscriptionMealOrderId,
  redemptionId,
  orderNumber,
  commissionDeductedPaise = 0,
}) => {
  const refId =
    orderId ||
    subscriptionMealOrderId ||
    (redemptionId ? (orderNumber ? `${redemptionId}_${orderNumber}` : redemptionId) : null);

  let earning = await ChefEarning.findOne({ idempotencyKey: `PENDING_EARNING_${refId}` });
  if (!earning && orderNumber) {
    earning = await ChefEarning.findOne({ orderNumber });
  }
  if (!earning && orderId) {
    earning = await ChefEarning.findOne({ orderId });
  }
  if (!earning && subscriptionMealOrderId) {
    earning = await ChefEarning.findOne({ subscriptionMealOrderId });
  }
  if (!earning && redemptionId && mongoose.Types.ObjectId.isValid(redemptionId)) {
    earning = await ChefEarning.findOne({ redemptionId });
  }

  if (!earning) {
    console.warn(
      `[ChefWalletService] No pending earning found for refId ${refId} to confirm.`
    );
    return null;
  }

  // Idempotency: if already available, return
  if (earning.status === "available") {
    return earning;
  }

  const grossAmountPaise = earning.grossAmountPaise;

  // Update earning document
  earning.status = "available";
  earning.availableAt = new Date();
  earning.commissionDeductedPaise = commissionDeductedPaise;
  await earning.save();

  // Atomically move funds from pending to available and increment totalEarned
  await ChefWallet.findOneAndUpdate(
    { chefId },
    {
      $inc: {
        pendingBalancePaise: -grossAmountPaise,
        availableBalancePaise: grossAmountPaise,
        totalEarnedPaise: grossAmountPaise,
      },
    },
    { new: true, upsert: true }
  );

  return earning;
};

/**
 * Reverses a pending chef earning if the order is cancelled or rejected before delivery.
 */
export const reversePendingChefEarning = async ({
  chefId,
  orderId,
  subscriptionMealOrderId,
  redemptionId,
  reason,
}) => {
  const refId = orderId || subscriptionMealOrderId || redemptionId;
  const earning = await ChefEarning.findOne({
    status: "pending",
    $or: [
      { orderId: refId },
      { subscriptionMealOrderId: refId },
      { redemptionId: refId },
      { idempotencyKey: `PENDING_EARNING_${refId}` },
    ],
  });

  if (!earning) {
    return null;
  }

  const grossAmountPaise = earning.grossAmountPaise;

  // Mark earning as reversed
  earning.status = "reversed";
  earning.reversedAt = new Date();
  earning.reversalReason = reason || "Order cancelled or rejected";
  await earning.save();

  // Decrement pending balance
  await ChefWallet.findOneAndUpdate(
    { chefId, pendingBalancePaise: { $gte: grossAmountPaise } },
    { $inc: { pendingBalancePaise: -grossAmountPaise } },
    { new: true }
  );

  return earning;
};

/**
 * Returns comprehensive Chef Earnings Wallet summary.
 */
export const getChefEarningsWalletOverview = async (chefId) => {
  const { canonicalId, possibleIds } = await getChefIdentityIds(chefId);

  // Self-healing: Automatically settle any delivered orders that were not previously settled
  try {
    const unSettledDeliveredOrders = await Order.find({
      chefId: { $in: possibleIds },
      orderStatus: "delivered",
      settlementStatus: { $ne: "settled" },
    });

    for (const order of unSettledDeliveredOrders) {
      try {
        if (order.paymentMethod === "online") {
          await settleOnlineOrderDelivery(canonicalId, order);
          order.paymentStatus = "paid";
          order.settlementStatus = "settled";
          await order.save();
        } else if (order.paymentMethod === "cod") {
          await captureCodOrderCommissionAndFee(canonicalId, order);
          order.paymentStatus = "paid";
          order.settlementStatus = "settled";
          await order.save();
        }
      } catch (innerErr) {
        // Individual settlement failure non-blocking
      }
    }
  } catch (healErr) {
    // Non-blocking auto-heal check
  }

  const wallet = await getOrCreateChefWallet(canonicalId);

  // Get count of earnings by status across all possible IDs
  const [counts] = await ChefEarning.aggregate([
    { $match: { chefId: { $in: possibleIds } } },
    {
      $group: {
        _id: null,
        pendingCount: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
        },
        availableCount: {
          $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] },
        },
        settledCount: {
          $sum: { $cond: [{ $eq: ["$status", "settled"] }, 1, 0] },
        },
        reversedCount: {
          $sum: { $cond: [{ $eq: ["$status", "reversed"] }, 1, 0] },
        },
      },
    },
  ]);

  const balancesRupees = {
    totalEarned: Number((wallet.totalEarnedPaise / 100).toFixed(2)),
    availableBalance: Number((wallet.availableBalancePaise / 100).toFixed(2)),
    pendingBalance: Number((wallet.pendingBalancePaise / 100).toFixed(2)),
    settledBalance: Number((wallet.settledBalancePaise / 100).toFixed(2)),
  };

  return {
    chefId: wallet.chefId,
    balancesPaise: {
      totalEarnedPaise: wallet.totalEarnedPaise,
      availableBalancePaise: wallet.availableBalancePaise,
      pendingBalancePaise: wallet.pendingBalancePaise,
      settledBalancePaise: wallet.settledBalancePaise,
    },
    balancesRupees,
    wallet: balancesRupees, // Direct alias
    availableBalance: balancesRupees.availableBalance, // Top-level shortcut
    totalEarned: balancesRupees.totalEarned,
    pendingBalance: balancesRupees.pendingBalance,
    settledBalance: balancesRupees.settledBalance,
    earningsSummary: {
      pendingEarningsCount: counts?.pendingCount || 0,
      completedEarningsCount: (counts?.availableCount || 0) + (counts?.settledCount || 0),
      reversedEarningsCount: counts?.reversedCount || 0,
      totalEarningsEntries:
        (counts?.pendingCount || 0) +
        (counts?.availableCount || 0) +
        (counts?.settledCount || 0) +
        (counts?.reversedCount || 0),
    },
  };
};

/**
 * Returns paginated chef earnings list with optional filters.
 */
export const getChefEarningsList = async (
  chefId,
  { status, sourceType, startDate, endDate, page = 1, limit = 20 }
) => {
  const { possibleIds } = await getChefIdentityIds(chefId);
  const query = { chefId: { $in: possibleIds } };
  if (status) query.status = status;
  if (sourceType) query.sourceType = sourceType;
  if (startDate && endDate) {
    query.earningDateKey = { $gte: startDate, $lte: endDate };
  } else if (startDate) {
    query.earningDateKey = { $gte: startDate };
  }

  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const [earnings, total] = await Promise.all([
    ChefEarning.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("orderId", "orderNumber deliveryType totalAmount subtotal deliveryFee")
      .populate("subscriptionMealOrderId", "mealOrderNumber mealType scheduledDateKey")
      .lean(),
    ChefEarning.countDocuments(query),
  ]);

  return {
    earnings,
    transactions: earnings, // Top-level alias
    pagination: {
      total,
      page: numericPage,
      limit: numericLimit,
      pages: Math.ceil(total / numericLimit) || 1,
    },
  };
};

/**
 * Returns single earning entry details.
 */
export const getChefEarningById = async (chefId, earningId) => {
  const earning = await ChefEarning.findOne({ _id: earningId, chefId })
    .populate("orderId", "orderNumber deliveryType totalAmount subtotal deliveryFee customerId")
    .populate("subscriptionMealOrderId", "mealOrderNumber mealType scheduledDateKey customerId")
    .lean();

  if (!earning) {
    const error = new Error("Chef earning record not found.");
    error.statusCode = 404;
    throw error;
  }

  return earning;
};

/**
 * Returns chef commission wallet details including sequence and ₹50 minimum balance status.
 */
export const getChefCommissionWalletOverview = async (chefId) => {
  const possibleChefIds = await resolveChefIds(chefId);
  const [wallet, sequence] = await Promise.all([
    ChefCommissionWallet.findOne({ chefId: { $in: possibleChefIds } }),
    ChefOrderSequence.findOne({ chefId: { $in: possibleChefIds } }),
  ]);

  const balancePaise = wallet?.balancePaise || 0;
  const availableBalancePaise = wallet?.availableBalancePaise || 0;
  const reservedBalancePaise = wallet?.reservedBalancePaise || 0;
  const totalCommissionPaidPaise = wallet?.totalCommissionPaidPaise || 0;

  const hasUsedFirstOrderFreeBenefit = sequence?.hasUsedFirstOrderFreeBenefit || false;
  const acceptedOrderCount = sequence?.acceptedOrderCount || 0;

  // Minimum required balance is ₹50 (5000 paise) for 2nd order onwards
  const isMinimumBalanceSatisfied = hasUsedFirstOrderFreeBenefit
    ? availableBalancePaise >= 5000
    : true; // 1st order does not require minimum balance

  return {
    chefId,
    balancesPaise: {
      balancePaise,
      availableBalancePaise,
      reservedBalancePaise,
      totalCommissionPaidPaise,
    },
    balancesRupees: {
      balance: Number((balancePaise / 100).toFixed(2)),
      availableBalance: Number((availableBalancePaise / 100).toFixed(2)),
      reservedBalance: Number((reservedBalancePaise / 100).toFixed(2)),
      totalCommissionPaid: Number((totalCommissionPaidPaise / 100).toFixed(2)),
    },
    orderSequence: {
      acceptedOrderCount,
      hasUsedFirstOrderFreeBenefit,
      nextOrderCommissionRate: hasUsedFirstOrderFreeBenefit ? "10%" : "0% (Free)",
      isMinimumBalanceSatisfied,
      minimumBalanceRequiredRupees: hasUsedFirstOrderFreeBenefit ? 50.0 : 0.0,
    },
  };
};

/**
 * Returns paginated chef commission transactions ledger.
 */
export const getChefCommissionTransactions = async (
  chefId,
  { page = 1, limit = 20 }
) => {
  const possibleChefIds = await resolveChefIds(chefId);
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const [transactions, total] = await Promise.all([
    ChefCommissionTransaction.find({ chefId: { $in: possibleChefIds } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .lean(),
    ChefCommissionTransaction.countDocuments({ chefId: { $in: possibleChefIds } }),
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
