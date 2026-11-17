import crypto from "node:crypto";
import ChefWallet from "../Models/ChefWallet.js";
import ChefEarning from "../Models/ChefEarning.js";
import ChefOrderSequence from "../Models/ChefOrderSequence.js";
import AdminWallet from "../Models/AdminWallet.js";
import AdminWalletTransaction from "../Models/AdminWalletTransaction.js";
import { getPlatformConfig } from "./platformConfigService.js";

const generateTxNumber = (prefix = "ONL") => {
  return `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

/**
 * Settles an Online Instant Order upon delivery.
 * - Platform collected payment upfront via gateway.
 * - Chef Commission Wallet is NOT touched.
 * - Chef is paid net earnings (food amount - commission) directly into withdrawable ChefWallet.
 * - AdminWallet earns commission and records promotional discount expense.
 */
export async function settleOnlineOrderDelivery(chefId, order, session = null) {
  const config = await getPlatformConfig();
  const foodPaise = order.subtotalPaise || Math.round(order.subtotal * 100);
  const subsidyPaise = order.onlineDiscountPaise || 0;

  // Check first-order benefit
  let sequence = await ChefOrderSequence.findOne({ chefId }).session(session);
  if (!sequence) {
    sequence = new ChefOrderSequence({
      chefId,
      acceptedOrderCount: 0,
      hasUsedFirstOrderFreeBenefit: false,
    });
  }

  const isFirstOrder = Boolean(
    !sequence.hasUsedFirstOrderFreeBenefit ||
    (sequence.firstOrderId && sequence.firstOrderId.toString() === order._id.toString())
  );

  if (!sequence.hasUsedFirstOrderFreeBenefit) {
    sequence.hasUsedFirstOrderFreeBenefit = true;
    sequence.firstOrderId = order._id;
    sequence.firstOrderAcceptedAt = new Date();
    sequence.acceptedOrderCount += 1;
    await sequence.save({ session });
  }

  const commissionPaise = isFirstOrder ? 0 : Math.round(foodPaise * config.standardCommissionRate);
  const chefNetEarningsPaise = Math.max(0, foodPaise - commissionPaise);

  // 1. Credit Chef Wallet (withdrawable balance)
  let chefWallet = await ChefWallet.findOne({ chefId }).session(session);
  if (!chefWallet) {
    chefWallet = new ChefWallet({
      chefId,
      pendingBalancePaise: 0,
      availableBalancePaise: 0,
      settledBalancePaise: 0,
      totalEarnedPaise: 0,
      reservedWithdrawalBalancePaise: 0,
    });
  }

  chefWallet.availableBalancePaise += chefNetEarningsPaise;
  chefWallet.totalEarnedPaise += chefNetEarningsPaise;
  await chefWallet.save({ session });

  // 2. Record Chef Earning
  let earning = await ChefEarning.findOne({ orderId: order._id }).session(session);
  if (!earning) {
    earning = new ChefEarning({
      earningNumber: `ERN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      chefId,
      sourceType: "instant_order",
      orderId: order._id,
      orderNumber: order.orderNumber,
      grossAmountPaise: foodPaise,
      netEarningsPaise: chefNetEarningsPaise,
      commissionDeductedPaise: commissionPaise,
      status: "available",
      availableAt: new Date(),
      idempotencyKey: `earn_onl_${order._id.toString()}`,
    });
  } else {
    earning.grossAmountPaise = foodPaise;
    earning.netEarningsPaise = chefNetEarningsPaise;
    earning.commissionDeductedPaise = commissionPaise;
    earning.status = "available";
    earning.availableAt = new Date();
  }
  await earning.save({ session });

  // 3. Settle Platform Admin Wallet
  let adminWallet = await AdminWallet.findOne({ walletType: "platform_commission" }).session(session);
  if (!adminWallet) {
    adminWallet = new AdminWallet({
      walletType: "platform_commission",
      totalCommissionEarnedPaise: 0,
      totalCodFeeEarnedPaise: 0,
      totalPromotionalDiscountExpensePaise: 0,
      availableBalancePaise: 0,
      settledBalancePaise: 0,
    });
  }

  // Commission revenue
  if (commissionPaise > 0) {
    adminWallet.totalCommissionEarnedPaise += commissionPaise;
    adminWallet.availableBalancePaise += commissionPaise;
    adminWallet.settledBalancePaise += commissionPaise;

    const adminCommTx = new AdminWalletTransaction({
      transactionNumber: generateTxNumber("ADM-COMM"),
      adminWalletId: adminWallet._id,
      chefId,
      transactionType: "commission_credit",
      amountPaise: commissionPaise,
      balanceAfterPaise: adminWallet.availableBalancePaise,
      orderId: order._id,
      description: `Commission earned from delivered online order ${order.orderNumber}`,
      idempotencyKey: `adm_onl_comm_${order._id.toString()}`,
    });
    await adminCommTx.save({ session });
  }

  // Promotional discount expense (platform-funded online subsidy)
  if (subsidyPaise > 0) {
    adminWallet.totalPromotionalDiscountExpensePaise += subsidyPaise;

    const adminExpTx = new AdminWalletTransaction({
      transactionNumber: generateTxNumber("ADM-DISC"),
      adminWalletId: adminWallet._id,
      chefId,
      transactionType: "promotional_discount_expense",
      amountPaise: subsidyPaise,
      balanceAfterPaise: adminWallet.availableBalancePaise,
      orderId: order._id,
      description: `Platform promotional discount expense for online order ${order.orderNumber}`,
      idempotencyKey: `adm_onl_disc_${order._id.toString()}`,
    });
    await adminExpTx.save({ session });
  }

  await adminWallet.save({ session });

  // 4. Update order settlement status
  order.settlementStatus = "settled";
  order.settledAt = new Date();
  await order.save({ session });

  return {
    chefNetEarningsPaise,
    commissionPaise,
    subsidyPaise,
    isFirstOrder,
  };
}

/**
 * Settles a Reward Meal Redemption (Policy A: 100% menu food price payable to chef, 0% commission).
 */
export async function settleRewardMealReimbursement(chefId, foodPricePaise, orderId, orderNumber, session = null) {
  let chefWallet = await ChefWallet.findOne({ chefId }).session(session);
  if (!chefWallet) {
    chefWallet = new ChefWallet({
      chefId,
      pendingBalancePaise: 0,
      availableBalancePaise: 0,
      settledBalancePaise: 0,
      totalEarnedPaise: 0,
      reservedWithdrawalBalancePaise: 0,
    });
  }

  chefWallet.availableBalancePaise += foodPricePaise;
  chefWallet.totalEarnedPaise += foodPricePaise;
  await chefWallet.save({ session });

  const earning = new ChefEarning({
    earningNumber: `ERN-RWD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    chefId,
    sourceType: "reward_redemption",
    orderId,
    orderNumber,
    grossAmountPaise: foodPricePaise,
    netEarningsPaise: foodPricePaise,
    commissionDeductedPaise: 0, // 0% commission on reward meals
    status: "available",
    availableAt: new Date(),
    idempotencyKey: `earn_rwd_${orderId ? orderId.toString() : Date.now()}`,
  });
  await earning.save({ session });

  return {
    reimbursedPaise: foodPricePaise,
    chefWallet,
    earning,
  };
}
