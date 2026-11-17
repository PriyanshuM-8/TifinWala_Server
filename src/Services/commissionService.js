import crypto from "crypto";
import ChefCommissionWallet from "../Models/ChefCommissionWallet.js";
import ChefCommissionTransaction from "../Models/ChefCommissionTransaction.js";
import ChefOrderSequence from "../Models/ChefOrderSequence.js";
import AdminWallet from "../Models/AdminWallet.js";
import AdminWalletTransaction from "../Models/AdminWalletTransaction.js";

export const MINIMUM_COMMISSION_WALLET_BALANCE_PAISE = 5000; // ₹50.00
export const STANDARD_COMMISSION_RATE = 0.1; // 10%

/**
 * Generate unique transaction number e.g. GKS-CWT-XXXXXX
 */
const generateTransactionNumber = (prefix = "GKS-CWT") => {
  return `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

/**
 * Ensures ChefCommissionWallet exists for a given chef.
 */
export const getOrCreateChefCommissionWallet = async (chefId) => {
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
  return wallet;
};

/**
 * Ensures ChefOrderSequence exists for a given chef.
 */
export const getOrCreateChefOrderSequence = async (chefId) => {
  let sequence = await ChefOrderSequence.findOne({ chefId });
  if (!sequence) {
    sequence = await ChefOrderSequence.create({
      chefId,
      acceptedOrderCount: 0,
      hasUsedFirstOrderFreeBenefit: false,
    });
  }
  return sequence;
};

/**
 * Ensures platform AdminWallet exists.
 */
export const getOrCreateAdminWallet = async () => {
  let wallet = await AdminWallet.findOne({ walletType: "platform_commission" });
  if (!wallet) {
    wallet = await AdminWallet.create({
      walletType: "platform_commission",
      totalCommissionEarnedPaise: 0,
      availableBalancePaise: 0,
      settledBalancePaise: 0,
    });
  }
  return wallet;
};

/**
 * Checks commission eligibility and reserves commission upon order acceptance.
 *
 * Rules:
 * 1. First accepted order for the chef has 0% commission and no reservation.
 *    The benefit is consumed atomically immediately.
 * 2. Second accepted order onwards:
 *    - Commission rate = 10%.
 *    - Chef must have availableBalancePaise >= max(5000 paise (₹50), estimatedCommissionPaise).
 *    - Estimated commission is reserved atomically.
 */
export const evaluateAndReserveCommission = async ({
  chefId,
  orderId,
  subscriptionMealOrderId,
  basePaise,
  orderNumber,
}) => {
  const sequence = await getOrCreateChefOrderSequence(chefId);
  const wallet = await getOrCreateChefCommissionWallet(chefId);

  // 1. Check if first accepted order free benefit is available
  if (!sequence.hasUsedFirstOrderFreeBenefit) {
    // Atomically consume first order benefit (concurrency safe)
    const updatedSeq = await ChefOrderSequence.findOneAndUpdate(
      { chefId, hasUsedFirstOrderFreeBenefit: false },
      {
        $set: {
          hasUsedFirstOrderFreeBenefit: true,
          firstOrderId: orderId || null,
          firstOrderAcceptedAt: new Date(),
        },
        $inc: { acceptedOrderCount: 1 },
      },
      { new: true }
    );

    if (updatedSeq) {
      // First order benefit granted! Record 0-amount ledger entry and return 0% commission.
      const refId = orderId || subscriptionMealOrderId;
      await ChefCommissionTransaction.create({
        transactionNumber: generateTransactionNumber(),
        chefId,
        commissionWalletId: wallet._id,
        transactionType: "commission_reserve",
        amountPaise: 0,
        availableBalanceAfterPaise: wallet.availableBalancePaise,
        reservedBalanceAfterPaise: wallet.reservedBalancePaise,
        totalBalanceAfterPaise: wallet.balancePaise,
        orderId,
        subscriptionMealOrderId,
        description: `First accepted order benefit: 0% commission for order ${orderNumber || ""}`,
        idempotencyKey: `RESERVE_${refId}`,
      });

      return {
        isFirstOrder: true,
        commissionRate: 0,
        estimatedCommissionPaise: 0,
        reservedPaise: 0,
      };
    }
    // If null, concurrent turn consumed it, fall through to 2nd order onwards
  }

  // 2. Second accepted order onwards: 10% commission applies
  const estimatedCommissionPaise = Math.round(basePaise * STANDARD_COMMISSION_RATE);
  const requiredBalancePaise = Math.max(
    MINIMUM_COMMISSION_WALLET_BALANCE_PAISE,
    estimatedCommissionPaise
  );

  // Check if available balance meets the required threshold
  if (wallet.availableBalancePaise < requiredBalancePaise) {
    const error = new Error(
      `Commission wallet balance insufficient. Minimum available balance of ₹50.00 or estimated commission (₹${(
        estimatedCommissionPaise / 100
      ).toFixed(2)}) is required to accept new orders. Current available balance: ₹${(
        wallet.availableBalancePaise / 100
      ).toFixed(2)}. Please recharge your commission wallet.`
    );
    error.statusCode = 400;
    error.code = "INSUFFICIENT_COMMISSION_BALANCE";
    error.requiredBalanceRupees = requiredBalancePaise / 100;
    error.availableBalanceRupees = wallet.availableBalancePaise / 100;
    throw error;
  }

  const idempotencyKey = `RESERVE_${orderId || subscriptionMealOrderId}`;

  // Check idempotency in case of repeated acceptance call
  const existingTx = await ChefCommissionTransaction.findOne({ idempotencyKey });
  if (existingTx) {
    return {
      isFirstOrder: false,
      commissionRate: STANDARD_COMMISSION_RATE,
      estimatedCommissionPaise: existingTx.amountPaise,
      reservedPaise: existingTx.amountPaise,
      alreadyReserved: true,
    };
  }

  // Atomically reserve funds
  const updatedWallet = await ChefCommissionWallet.findOneAndUpdate(
    {
      chefId,
      availableBalancePaise: { $gte: requiredBalancePaise },
    },
    {
      $inc: {
        availableBalancePaise: -estimatedCommissionPaise,
        reservedBalancePaise: estimatedCommissionPaise,
      },
    },
    { new: true }
  );

  if (!updatedWallet) {
    const error = new Error(
      "Concurrent update conflict: Commission wallet balance became insufficient during reservation."
    );
    error.statusCode = 400;
    throw error;
  }

  // Record ledger entry
  await ChefCommissionTransaction.create({
    transactionNumber: generateTransactionNumber(),
    chefId,
    commissionWalletId: updatedWallet._id,
    transactionType: "commission_reserve",
    amountPaise: estimatedCommissionPaise,
    availableBalanceAfterPaise: updatedWallet.availableBalancePaise,
    reservedBalanceAfterPaise: updatedWallet.reservedBalancePaise,
    totalBalanceAfterPaise: updatedWallet.balancePaise,
    orderId,
    subscriptionMealOrderId,
    description: `Commission reserved for order ${orderNumber || ""}`,
    idempotencyKey,
  });

  // Increment sequence count
  await ChefOrderSequence.updateOne(
    { chefId },
    { $inc: { acceptedOrderCount: 1 } }
  );

  return {
    isFirstOrder: false,
    commissionRate: STANDARD_COMMISSION_RATE,
    estimatedCommissionPaise,
    reservedPaise: estimatedCommissionPaise,
  };
};

/**
 * Captures reserved commission upon successful delivery and credits Admin Wallet.
 */
export const captureCommission = async ({
  chefId,
  orderId,
  subscriptionMealOrderId,
  finalBasePaise,
  isFirstOrder = false,
  orderNumber,
}) => {
  const refId = orderId || subscriptionMealOrderId;
  const captureIdempotencyKey = `CAPTURE_${refId}`;

  // Find corresponding reservation transaction to know how much was reserved
  const reserveTx = await ChefCommissionTransaction.findOne({
    idempotencyKey: `RESERVE_${refId}`,
  });

  // If first order or no commission was reserved, commission is strictly zero
  if (isFirstOrder || !reserveTx || reserveTx.amountPaise === 0) {
    return {
      capturedPaise: 0,
      isFirstOrder: true,
      message: "Order completed with 0% platform commission.",
    };
  }

  // Idempotency check: prevent duplicate commission capture
  const existingCapture = await ChefCommissionTransaction.findOne({
    idempotencyKey: captureIdempotencyKey,
  });
  if (existingCapture) {
    return {
      capturedPaise: existingCapture.amountPaise,
      alreadyCaptured: true,
    };
  }

  const finalCommissionPaise = Math.round(finalBasePaise * STANDARD_COMMISSION_RATE);
  const reservedPaise = reserveTx.amountPaise;

  const diffPaise = reservedPaise - finalCommissionPaise;

  // Atomically update ChefCommissionWallet
  const updatedWallet = await ChefCommissionWallet.findOneAndUpdate(
    { chefId },
    {
      $inc: {
        reservedBalancePaise: -reservedPaise,
        balancePaise: -finalCommissionPaise,
        totalCommissionPaidPaise: finalCommissionPaise,
        // If reserved was greater than final, return excess to available balance
        ...(diffPaise > 0 ? { availableBalancePaise: diffPaise } : {}),
      },
    },
    { new: true }
  );

  // Write ChefCommissionTransaction
  await ChefCommissionTransaction.create({
    transactionNumber: generateTransactionNumber(),
    chefId,
    commissionWalletId: updatedWallet._id,
    transactionType: "commission_capture",
    amountPaise: finalCommissionPaise,
    availableBalanceAfterPaise: updatedWallet.availableBalancePaise,
    reservedBalanceAfterPaise: updatedWallet.reservedBalancePaise,
    totalBalanceAfterPaise: updatedWallet.balancePaise,
    orderId,
    subscriptionMealOrderId,
    description: `Commission captured for delivered order ${orderNumber || ""}`,
    idempotencyKey: captureIdempotencyKey,
  });

  // Credit platform AdminWallet
  const adminWallet = await getOrCreateAdminWallet();
  const updatedAdminWallet = await AdminWallet.findOneAndUpdate(
    { _id: adminWallet._id },
    {
      $inc: {
        totalCommissionEarnedPaise: finalCommissionPaise,
        availableBalancePaise: finalCommissionPaise,
      },
    },
    { new: true }
  );

  // Write AdminWalletTransaction
  await AdminWalletTransaction.create({
    transactionNumber: generateTransactionNumber("GKS-AWT"),
    adminWalletId: updatedAdminWallet._id,
    chefId,
    transactionType: "commission_credit",
    amountPaise: finalCommissionPaise,
    balanceAfterPaise: updatedAdminWallet.availableBalancePaise,
    orderId,
    subscriptionMealOrderId,
    description: `Platform commission captured from chef for order ${orderNumber || ""}`,
    idempotencyKey: `ADMIN_COMMISSION_${refId}`,
  });

  return {
    capturedPaise: finalCommissionPaise,
    capturedRupees: finalCommissionPaise / 100,
    isFirstOrder: false,
  };
};

/**
 * Releases reserved commission when an order is cancelled or rejected.
 * Important: First-order benefit is NOT restored even if the order is cancelled.
 */
export const releaseCommissionReservation = async ({
  chefId,
  orderId,
  subscriptionMealOrderId,
  orderNumber,
  reason,
}) => {
  const refId = orderId || subscriptionMealOrderId;
  const releaseIdempotencyKey = `RELEASE_${refId}`;

  // Idempotency check
  const existingRelease = await ChefCommissionTransaction.findOne({
    idempotencyKey: releaseIdempotencyKey,
  });
  if (existingRelease) {
    return {
      released: true,
      alreadyReleased: true,
      amountPaise: existingRelease.amountPaise,
    };
  }

  // Find corresponding reservation transaction
  const reserveTx = await ChefCommissionTransaction.findOne({
    idempotencyKey: `RESERVE_${refId}`,
  });

  if (!reserveTx || reserveTx.amountPaise === 0) {
    // No commission was reserved (e.g. 1st free order)
    return { released: false, amountPaise: 0, reason: "No commission was reserved" };
  }

  const reservedPaise = reserveTx.amountPaise;

  // Restore funds from reserved to available
  const updatedWallet = await ChefCommissionWallet.findOneAndUpdate(
    { chefId, reservedBalancePaise: { $gte: reservedPaise } },
    {
      $inc: {
        reservedBalancePaise: -reservedPaise,
        availableBalancePaise: reservedPaise,
      },
    },
    { new: true }
  );

  if (!updatedWallet) {
    return { released: false, reason: "Wallet reserved balance was already released" };
  }

  // Record ledger entry
  await ChefCommissionTransaction.create({
    transactionNumber: generateTransactionNumber(),
    chefId,
    commissionWalletId: updatedWallet._id,
    transactionType: "commission_release",
    amountPaise: reservedPaise,
    availableBalanceAfterPaise: updatedWallet.availableBalancePaise,
    reservedBalanceAfterPaise: updatedWallet.reservedBalancePaise,
    totalBalanceAfterPaise: updatedWallet.balancePaise,
    orderId,
    subscriptionMealOrderId,
    description: `Commission reservation released for order ${orderNumber || ""}. Reason: ${
      reason || "Cancelled/Rejected"
    }`,
    idempotencyKey: releaseIdempotencyKey,
  });

  return {
    released: true,
    amountPaise: reservedPaise,
    amountRupees: reservedPaise / 100,
  };
};

/**
 * Helper to credit a chef's commission wallet for test fixtures or authorized admin adjustments.
 */
export const creditChefCommissionWallet = async ({
  chefId,
  amountPaise,
  description,
  adminUserId,
  auditReason,
}) => {
  if (typeof amountPaise !== "number" || amountPaise <= 0) {
    throw new Error("amountPaise must be a positive integer.");
  }

  const wallet = await getOrCreateChefCommissionWallet(chefId);

  const updatedWallet = await ChefCommissionWallet.findOneAndUpdate(
    { chefId },
    {
      $inc: {
        balancePaise: amountPaise,
        availableBalancePaise: amountPaise,
      },
    },
    { new: true }
  );

  const tx = await ChefCommissionTransaction.create({
    transactionNumber: generateTransactionNumber(),
    chefId,
    commissionWalletId: updatedWallet._id,
    transactionType: adminUserId ? "admin_credit" : "recharge_credit",
    amountPaise,
    availableBalanceAfterPaise: updatedWallet.availableBalancePaise,
    reservedBalanceAfterPaise: updatedWallet.reservedBalancePaise,
    totalBalanceAfterPaise: updatedWallet.balancePaise,
    description: description || "Commission wallet credit",
    adminUserId,
    auditReason,
  });

  return { wallet: updatedWallet, transaction: tx };
};
