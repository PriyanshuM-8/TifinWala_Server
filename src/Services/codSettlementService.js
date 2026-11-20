import crypto from "node:crypto";
import ChefCommissionWallet from "../Models/ChefCommissionWallet.js";
import ChefCommissionTransaction from "../Models/ChefCommissionTransaction.js";
import ChefOrderSequence from "../Models/ChefOrderSequence.js";
import ChefProfile from "../Models/ChefProfile.js";
import AdminWallet from "../Models/AdminWallet.js";
import AdminWalletTransaction from "../Models/AdminWalletTransaction.js";
import ChefEarning from "../Models/ChefEarning.js";
import { getPlatformConfig } from "./platformConfigService.js";

const generateTxNumber = (prefix = "COD") => {
  return `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

async function resolveChefIds(chefId) {
  const ids = [chefId];
  try {
    const profile = await ChefProfile.findOne({
      $or: [{ userId: chefId }, { _id: chefId }],
    });
    if (profile) {
      if (profile.userId && !ids.some((i) => i.toString() === profile.userId.toString())) {
        ids.push(profile.userId);
      }
      if (profile._id && !ids.some((i) => i.toString() === profile._id.toString())) {
        ids.push(profile._id);
      }
    }
  } catch {}
  return ids;
}

/**
 * Checks whether the chef's commission wallet has enough available balance to accept a COD order.
 * Required Balance = minimumReservePaise (5000) + estimatedCommissionPaise + codFeePaise (2000)
 */
export async function validateCodAcceptanceEligibility(chefId, foodAndDeliveryPaise) {
  const config = await getPlatformConfig();
  const minReservePaise = config.minimumCommissionWalletBalancePaise; // 5000 paise (₹50)
  const codFeePaise = config.codFeePaise; // 2000 paise (₹20)

  // Check first-order benefit across both userId and chefProfile._id
  const possibleChefIds = await resolveChefIds(chefId);
  let sequence = await ChefOrderSequence.findOne({ chefId: { $in: possibleChefIds } });
  const isFirstOrder = !sequence || !sequence.hasUsedFirstOrderFreeBenefit;

  const estimatedCommissionPaise = isFirstOrder
    ? 0
    : Math.round(foodAndDeliveryPaise * config.standardCommissionRate);

  const requiredBalancePaise = minReservePaise + estimatedCommissionPaise + codFeePaise;

  let wallet = await ChefCommissionWallet.findOne({ chefId: { $in: possibleChefIds } });
  const currentAvailablePaise = wallet ? wallet.availableBalancePaise : 0;

  if (currentAvailablePaise < requiredBalancePaise) {
    const error = new Error(
      `Insufficient Chef Commission Wallet balance for Cash on Delivery order. Required available balance: ₹${(
        requiredBalancePaise / 100
      ).toFixed(2)} (Minimum Reserve ₹${(minReservePaise / 100).toFixed(2)} + Commission ₹${(
        estimatedCommissionPaise / 100
      ).toFixed(2)} + COD Fee ₹${(codFeePaise / 100).toFixed(2)}). Current available balance: ₹${(
        currentAvailablePaise / 100
      ).toFixed(2)}. Please recharge your commission wallet to accept COD orders.`
    );
    error.statusCode = 400;
    error.code = "INSUFFICIENT_COD_COMMISSION_BALANCE";
    error.requiredBalancePaise = requiredBalancePaise;
    error.availableBalancePaise = currentAvailablePaise;
    error.shortByPaise = requiredBalancePaise - currentAvailablePaise;
    throw error;
  }

  return {
    eligible: true,
    isFirstOrder,
    estimatedCommissionPaise,
    codFeePaise,
    minReservePaise,
    requiredBalancePaise,
  };
}

/**
 * Atomically reserves commission and COD fee from ChefCommissionWallet upon COD order acceptance.
 */
export async function reserveCodOrderCommissionAndFee(chefId, order, session = null) {
  const possibleChefIds = await resolveChefIds(chefId);
  const foodPaise = order.subtotalPaise || Math.round(order.subtotal * 100);
  const eligibility = await validateCodAcceptanceEligibility(chefId, foodPaise);

  let wallet = await ChefCommissionWallet.findOne({ chefId: { $in: possibleChefIds } }).session(session);
  if (!wallet) {
    wallet = new ChefCommissionWallet({
      chefId: possibleChefIds[0] || chefId,
      balancePaise: 0,
      availableBalancePaise: 0,
      reservedBalancePaise: 0,
    });
  }

  // Handle first order sequence benefit consumption
  let sequence = await ChefOrderSequence.findOne({ chefId: { $in: possibleChefIds } }).session(session);
  if (!sequence) {
    sequence = new ChefOrderSequence({
      chefId: possibleChefIds[0] || chefId,
      acceptedOrderCount: 0,
      hasUsedFirstOrderFreeBenefit: false,
    });
  }

  let finalCommissionPaise = eligibility.estimatedCommissionPaise;
  if (!sequence.hasUsedFirstOrderFreeBenefit) {
    sequence.hasUsedFirstOrderFreeBenefit = true;
    sequence.firstOrderId = order._id;
    sequence.firstOrderAcceptedAt = new Date();
    sequence.acceptedOrderCount += 1;
    await sequence.save({ session });
    finalCommissionPaise = 0;
  } else {
    sequence.acceptedOrderCount += 1;
    await sequence.save({ session });
  }

  const codFeePaise = eligibility.codFeePaise;

  // 1. Reserve Commission (if > 0, or record 0 for 1st order)
  if (finalCommissionPaise > 0) {
    wallet.availableBalancePaise -= finalCommissionPaise;
    wallet.reservedBalancePaise += finalCommissionPaise;
  }

  const commissionTx = new ChefCommissionTransaction({
    transactionNumber: generateTxNumber("CC-RES"),
    chefId,
    commissionWalletId: wallet._id,
    transactionType: "commission_reserve",
    amountPaise: finalCommissionPaise,
    availableBalanceAfterPaise: wallet.availableBalancePaise,
    reservedBalanceAfterPaise: wallet.reservedBalancePaise,
    totalBalanceAfterPaise: wallet.balancePaise,
    orderId: order._id,
    description:
      finalCommissionPaise === 0
        ? `First order benefit: 0% commission reserved for COD order ${order.orderNumber}`
        : `10% commission reserved for COD order ${order.orderNumber}`,
    idempotencyKey: `cod_comm_res_${order._id.toString()}`,
  });
  await commissionTx.save({ session });

  // 2. Reserve COD fee (₹20 = 2000 paise)
  wallet.availableBalancePaise -= codFeePaise;
  wallet.reservedBalancePaise += codFeePaise;

  const codFeeTx = new ChefCommissionTransaction({
    transactionNumber: generateTxNumber("CF-RES"),
    chefId,
    commissionWalletId: wallet._id,
    transactionType: "cod_fee_reserve",
    amountPaise: codFeePaise,
    availableBalanceAfterPaise: wallet.availableBalancePaise,
    reservedBalanceAfterPaise: wallet.reservedBalancePaise,
    totalBalanceAfterPaise: wallet.balancePaise,
    orderId: order._id,
    description: `COD fee reserved for order ${order.orderNumber}`,
    idempotencyKey: `cod_fee_res_${order._id.toString()}`,
  });
  await codFeeTx.save({ session });

  await wallet.save({ session });

  return {
    wallet,
    commissionPaise: finalCommissionPaise,
    codFeePaise,
  };
}

/**
 * Captures reserved commission and COD fee upon successful COD delivery,
 * and records the chef's earning as 'cash_settled' (zero addition to withdrawable balance).
 */
export async function captureCodOrderCommissionAndFee(chefId, order, session = null) {
  const possibleChefIds = await resolveChefIds(chefId);
  let wallet = await ChefCommissionWallet.findOne({ chefId: { $in: possibleChefIds } }).session(session);
  if (!wallet) return;

  // Locate the reservations
  const [commReserveTx, codFeeReserveTx] = await Promise.all([
    ChefCommissionTransaction.findOne({
      orderId: order._id,
      transactionType: "commission_reserve",
    }).session(session),
    ChefCommissionTransaction.findOne({
      orderId: order._id,
      transactionType: "cod_fee_reserve",
    }).session(session),
  ]);

  const commissionPaise = commReserveTx ? commReserveTx.amountPaise : 0;
  const codFeePaise = codFeeReserveTx ? codFeeReserveTx.amountPaise : 0;

  // 1. Capture Commission
  if (commissionPaise > 0) {
    wallet.reservedBalancePaise = Math.max(0, wallet.reservedBalancePaise - commissionPaise);
    wallet.balancePaise = Math.max(0, wallet.balancePaise - commissionPaise);
    wallet.totalCommissionPaidPaise += commissionPaise;

    const commCapTx = new ChefCommissionTransaction({
      transactionNumber: generateTxNumber("CC-CAP"),
      chefId,
      commissionWalletId: wallet._id,
      transactionType: "commission_capture",
      amountPaise: commissionPaise,
      availableBalanceAfterPaise: wallet.availableBalancePaise,
      reservedBalanceAfterPaise: wallet.reservedBalancePaise,
      totalBalanceAfterPaise: wallet.balancePaise,
      orderId: order._id,
      description: `Commission captured for delivered COD order ${order.orderNumber}`,
      idempotencyKey: `cod_comm_cap_${order._id.toString()}`,
    });
    await commCapTx.save({ session });
  }

  // 2. Capture COD Fee
  if (codFeePaise > 0) {
    wallet.reservedBalancePaise = Math.max(0, wallet.reservedBalancePaise - codFeePaise);
    wallet.balancePaise = Math.max(0, wallet.balancePaise - codFeePaise);

    const codCapTx = new ChefCommissionTransaction({
      transactionNumber: generateTxNumber("CF-CAP"),
      chefId,
      commissionWalletId: wallet._id,
      transactionType: "cod_fee_capture",
      amountPaise: codFeePaise,
      availableBalanceAfterPaise: wallet.availableBalancePaise,
      reservedBalanceAfterPaise: wallet.reservedBalancePaise,
      totalBalanceAfterPaise: wallet.balancePaise,
      orderId: order._id,
      description: `COD fee captured for delivered COD order ${order.orderNumber}`,
      idempotencyKey: `cod_fee_cap_${order._id.toString()}`,
    });
    await codCapTx.save({ session });
  }

  await wallet.save({ session });

  // 3. Credit Admin Wallet
  let adminWallet = await AdminWallet.findOne({ walletType: "platform_commission" }).session(session);
  if (!adminWallet) {
    adminWallet = new AdminWallet({
      walletType: "platform_commission",
      totalCommissionEarnedPaise: 0,
      totalCodFeeEarnedPaise: 0,
      availableBalancePaise: 0,
      settledBalancePaise: 0,
    });
  }

  if (commissionPaise > 0) {
    adminWallet.totalCommissionEarnedPaise += commissionPaise;
    adminWallet.availableBalancePaise += commissionPaise;
    adminWallet.settledBalancePaise += commissionPaise;

    const adminCommTx = new AdminWalletTransaction({
      transactionNumber: generateTxNumber("ADM-CC"),
      adminWalletId: adminWallet._id,
      chefId,
      transactionType: "commission_credit",
      amountPaise: commissionPaise,
      balanceAfterPaise: adminWallet.availableBalancePaise,
      orderId: order._id,
      description: `Commission earned from COD order ${order.orderNumber}`,
      idempotencyKey: `adm_cod_comm_${order._id.toString()}`,
    });
    await adminCommTx.save({ session });
  }

  if (codFeePaise > 0) {
    adminWallet.totalCodFeeEarnedPaise += codFeePaise;
    adminWallet.availableBalancePaise += codFeePaise;
    adminWallet.settledBalancePaise += codFeePaise;

    const adminCodTx = new AdminWalletTransaction({
      transactionNumber: generateTxNumber("ADM-CF"),
      adminWalletId: adminWallet._id,
      chefId,
      transactionType: "cod_fee_credit",
      amountPaise: codFeePaise,
      balanceAfterPaise: adminWallet.availableBalancePaise,
      orderId: order._id,
      description: `COD fee earned from COD order ${order.orderNumber}`,
      idempotencyKey: `adm_cod_fee_${order._id.toString()}`,
    });
    await adminCodTx.save({ session });
  }

  await adminWallet.save({ session });

  // 4. Record Chef Earning as 'cash_settled'
  // Chef collected food amount + COD fee in cash directly from customer.
  // Net food earning kept in hand = foodPaise - commissionPaise.
  const foodPaise = order.subtotalPaise || Math.round(order.subtotal * 100);
  const netEarningsPaise = Math.max(0, foodPaise - commissionPaise);

  let earning = await ChefEarning.findOne({ orderId: order._id }).session(session);
  if (!earning) {
    earning = new ChefEarning({
      earningNumber: `ERN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      chefId,
      sourceType: "instant_order",
      orderId: order._id,
      orderNumber: order.orderNumber,
      grossAmountPaise: foodPaise,
      netEarningsPaise,
      commissionDeductedPaise: commissionPaise,
      status: "cash_settled",
      settledAt: new Date(),
      idempotencyKey: `earn_cod_${order._id.toString()}`,
    });
  } else {
    earning.status = "cash_settled";
    earning.grossAmountPaise = foodPaise;
    earning.netEarningsPaise = netEarningsPaise;
    earning.commissionDeductedPaise = commissionPaise;
    earning.settledAt = new Date();
  }
  await earning.save({ session });

  // Mark order settlement
  order.settlementStatus = "settled";
  order.settledAt = new Date();
  await order.save({ session });

  return {
    commissionPaise,
    codFeePaise,
    netEarningsPaise,
  };
}

/**
 * Releases reserved commission and COD fee if COD order is cancelled or rejected before delivery.
 */
export async function releaseCodOrderCommissionAndFee(chefId, order, session = null) {
  const possibleChefIds = await resolveChefIds(chefId);
  let wallet = await ChefCommissionWallet.findOne({ chefId: { $in: possibleChefIds } }).session(session);
  if (!wallet) return;

  const [commReserveTx, codFeeReserveTx] = await Promise.all([
    ChefCommissionTransaction.findOne({
      orderId: order._id,
      transactionType: "commission_reserve",
    }).session(session),
    ChefCommissionTransaction.findOne({
      orderId: order._id,
      transactionType: "cod_fee_reserve",
    }).session(session),
  ]);

  const reservedCommissionPaise = commReserveTx ? commReserveTx.amountPaise : 0;
  const reservedCodFeePaise = codFeeReserveTx ? codFeeReserveTx.amountPaise : 0;

  if (reservedCommissionPaise > 0) {
    wallet.reservedBalancePaise = Math.max(0, wallet.reservedBalancePaise - reservedCommissionPaise);
    wallet.availableBalancePaise += reservedCommissionPaise;

    const commRelTx = new ChefCommissionTransaction({
      transactionNumber: generateTxNumber("CC-REL"),
      chefId,
      commissionWalletId: wallet._id,
      transactionType: "commission_release",
      amountPaise: reservedCommissionPaise,
      availableBalanceAfterPaise: wallet.availableBalancePaise,
      reservedBalanceAfterPaise: wallet.reservedBalancePaise,
      totalBalanceAfterPaise: wallet.balancePaise,
      orderId: order._id,
      description: `Commission reservation released for unfulfilled COD order ${order.orderNumber}`,
      idempotencyKey: `cod_comm_rel_${order._id.toString()}`,
    });
    await commRelTx.save({ session });
  }

  if (reservedCodFeePaise > 0) {
    wallet.reservedBalancePaise = Math.max(0, wallet.reservedBalancePaise - reservedCodFeePaise);
    wallet.availableBalancePaise += reservedCodFeePaise;

    const codRelTx = new ChefCommissionTransaction({
      transactionNumber: generateTxNumber("CF-REL"),
      chefId,
      commissionWalletId: wallet._id,
      transactionType: "cod_fee_release",
      amountPaise: reservedCodFeePaise,
      availableBalanceAfterPaise: wallet.availableBalancePaise,
      reservedBalanceAfterPaise: wallet.reservedBalancePaise,
      totalBalanceAfterPaise: wallet.balancePaise,
      orderId: order._id,
      description: `COD fee reservation released for unfulfilled COD order ${order.orderNumber}`,
      idempotencyKey: `cod_fee_rel_${order._id.toString()}`,
    });
    await codRelTx.save({ session });
  }

  await wallet.save({ session });

  return {
    releasedCommissionPaise: reservedCommissionPaise,
    releasedCodFeePaise: reservedCodFeePaise,
  };
}
