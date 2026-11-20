import crypto from "node:crypto";
import AdminWithdrawal from "../Models/AdminWithdrawal.js";
import AdminWallet from "../Models/AdminWallet.js";
import AdminWalletTransaction from "../Models/AdminWalletTransaction.js";
import AdminBankAccount from "../Models/AdminBankAccount.js";
import { getTreasuryOverview } from "./adminTreasuryService.js";
import { executePayout } from "./payoutService.js";
import { logAdminAction } from "./auditLogService.js";
import { getOrCreateAdminWallet } from "./commissionService.js";

const generateWithdrawalNumber = () =>
  `ADM-WTH-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

const generateTxNumber = (prefix = "ADM-TXN") =>
  `${prefix}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

/**
 * ADMIN: Request withdrawal from available platform earnings.
 */
export async function requestAdminWithdrawal(
  adminId,
  { amountRupees, bankAccountId, notes, idempotencyKey }
) {
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    idempotencyKey = `adm_wth_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  }

  // 1. Idempotency Check
  const existing = await AdminWithdrawal.findOne({ idempotencyKey });
  if (existing) {
    return {
      success: true,
      duplicate: true,
      withdrawal: existing,
      message: "Withdrawal request already recorded.",
    };
  }

  // 2. Validate Amount
  const parsedAmount = Number(amountRupees);
  if (isNaN(parsedAmount) || parsedAmount < 100) {
    const err = new Error("Minimum withdrawal amount is ₹100.00.");
    err.statusCode = 400;
    throw err;
  }

  const amountPaise = Math.round(parsedAmount * 100);

  // 3. Validate Bank Account
  let bankAccount;
  if (bankAccountId) {
    bankAccount = await AdminBankAccount.findOne({
      _id: bankAccountId,
      adminId,
      isActive: true,
    });
  } else {
    bankAccount = await AdminBankAccount.findOne({
      adminId,
      isActive: true,
      isDefault: true,
    });
  }

  if (!bankAccount) {
    const err = new Error("No active bank account selected. Please add and verify a bank account first.");
    err.statusCode = 400;
    throw err;
  }

  if (!bankAccount.isVerified) {
    const err = new Error("Selected bank account is not verified. Please verify the account before requesting withdrawal.");
    err.statusCode = 400;
    throw err;
  }

  // 4. Calculate Reconciled Available Cash (Dual-Ceiling)
  const treasury = await getTreasuryOverview();
  const availablePaise = treasury.availableWithdrawalBalancePaise;

  if (amountPaise > availablePaise) {
    const err = new Error(
      `Withdrawal amount of ₹${parsedAmount.toFixed(
        2
      )} exceeds current available reconciled balance of ₹${(availablePaise / 100).toFixed(2)}.`
    );
    err.statusCode = 400;
    err.availableBalanceRupees = Number((availablePaise / 100).toFixed(2));
    throw err;
  }

  // 5. Atomically Reserve Funds in AdminWallet
  const wallet = await getOrCreateAdminWallet();
  wallet.reservedWithdrawalPaise += amountPaise;
  await wallet.save();

  // Payout fee: ₹0 for internal admin payouts
  const payoutFeePaise = 0;
  const netTransferPaise = amountPaise - payoutFeePaise;

  // 6. Create Withdrawal Record
  const withdrawal = new AdminWithdrawal({
    withdrawalNumber: generateWithdrawalNumber(),
    adminId,
    bankAccountId: bankAccount._id,
    bankSnapshot: {
      accountHolderName: bankAccount.accountHolderName,
      bankName: bankAccount.bankName,
      maskedAccountNumber: bankAccount.maskedAccountNumber,
      maskedIfscCode: bankAccount.maskedIfscCode,
      accountType: bankAccount.accountType,
    },
    amountPaise,
    payoutFeePaise,
    netTransferPaise,
    status: "processing",
    payoutProvider: "razorpayx",
    idempotencyKey,
    requestedAt: new Date(),
    notes: notes ? String(notes).trim() : "",
  });

  await withdrawal.save();

  // 7. Record Ledger Transaction for Reservation
  await AdminWalletTransaction.create({
    transactionNumber: generateTxNumber("CC-WTH-RES"),
    adminWalletId: wallet._id,
    adminUserId: adminId,
    transactionType: "admin_withdrawal_reserve",
    amountPaise,
    balanceAfterPaise: wallet.availableBalancePaise,
    adminWithdrawalId: withdrawal._id,
    description: `Admin withdrawal reservation: #${withdrawal.withdrawalNumber} for ₹${parsedAmount.toFixed(2)}`,
    idempotencyKey: `res_${withdrawal._id}`,
  });

  // 8. Execute Payout via Payout Provider
  try {
    const payoutResult = await executePayout({
      withdrawal,
      bankAccountId: bankAccount._id,
    });

    withdrawal.providerPayoutId = payoutResult.providerPayoutId;
    withdrawal.providerStatus = payoutResult.providerStatus;
    withdrawal.payoutProvider = payoutResult.payoutProvider;
    if (payoutResult.utrNumber) {
      withdrawal.utrNumber = payoutResult.utrNumber;
    }
    await withdrawal.save();
  } catch (providerErr) {
    withdrawal.providerStatus = "queued_for_manual";
    withdrawal.notes += ` [Provider init note: ${providerErr.message}]`;
    await withdrawal.save();
  }

  await logAdminAction({
    adminId,
    actionType: "admin_withdrawal_requested",
    targetEntityType: "AdminWithdrawal",
    targetEntityId: withdrawal._id,
    previousState: null,
    newState: {
      withdrawalNumber: withdrawal.withdrawalNumber,
      amountPaise,
      status: withdrawal.status,
      bankSnapshot: withdrawal.bankSnapshot,
    },
    reason: `Withdrawal request initiated: #${withdrawal.withdrawalNumber} of ₹${parsedAmount.toFixed(2)}`,
  });

  return {
    success: true,
    withdrawal,
    remainingAvailableRupees: Number(((availablePaise - amountPaise) / 100).toFixed(2)),
    message: "Withdrawal request submitted and funds locked. Transfer is processing.",
  };
}

/**
 * ADMIN: List all admin withdrawals with filtering and pagination.
 */
export async function listAdminWithdrawals({
  page = 1,
  limit = 20,
  status,
  startDate,
  endDate,
} = {}) {
  const query = {};

  if (status && status !== "all") {
    query.status = status;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const [withdrawals, total] = await Promise.all([
    AdminWithdrawal.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("adminId", "name email")
      .populate("bankAccountId", "bankName maskedAccountNumber maskedIfscCode")
      .lean(),
    AdminWithdrawal.countDocuments(query),
  ]);

  return {
    withdrawals,
    pagination: {
      total,
      page: numericPage,
      limit: numericLimit,
      pages: Math.ceil(total / numericLimit) || 1,
    },
  };
}

/**
 * ADMIN: Get specific withdrawal details with ledger trail.
 */
export async function getAdminWithdrawalDetails(withdrawalId) {
  const withdrawal = await AdminWithdrawal.findById(withdrawalId)
    .populate("adminId", "name email role")
    .populate("bankAccountId")
    .lean();

  if (!withdrawal) {
    const err = new Error("Withdrawal record not found.");
    err.statusCode = 404;
    throw err;
  }

  const ledgerTransactions = await AdminWalletTransaction.find({
    adminWithdrawalId: withdrawal._id,
  })
    .sort({ createdAt: 1 })
    .lean();

  return {
    withdrawal,
    ledgerTransactions,
  };
}

/**
 * ADMIN: Cancel a pending/processing withdrawal and restore reserved funds.
 */
export async function cancelAdminWithdrawal(adminId, withdrawalId, reason) {
  const withdrawal = await AdminWithdrawal.findById(withdrawalId);
  if (!withdrawal) {
    const err = new Error("Withdrawal record not found.");
    err.statusCode = 404;
    throw err;
  }

  if (!["pending", "processing"].includes(withdrawal.status)) {
    const err = new Error(`Cannot cancel withdrawal with status '${withdrawal.status}'.`);
    err.statusCode = 400;
    throw err;
  }

  const wallet = await getOrCreateAdminWallet();
  wallet.reservedWithdrawalPaise = Math.max(0, wallet.reservedWithdrawalPaise - withdrawal.amountPaise);
  await wallet.save();

  withdrawal.status = "cancelled";
  withdrawal.failureReason = reason || "Cancelled by administrator.";
  await withdrawal.save();

  await AdminWalletTransaction.create({
    transactionNumber: generateTxNumber("CC-WTH-REL"),
    adminWalletId: wallet._id,
    adminUserId: adminId,
    transactionType: "admin_withdrawal_release",
    amountPaise: withdrawal.amountPaise,
    balanceAfterPaise: wallet.availableBalancePaise,
    adminWithdrawalId: withdrawal._id,
    description: `Admin withdrawal cancelled: reservation released for #${withdrawal.withdrawalNumber}. Reason: ${withdrawal.failureReason}`,
    idempotencyKey: `cnl_${withdrawal._id}_${Date.now()}`,
  });

  await logAdminAction({
    adminId,
    actionType: "admin_withdrawal_cancelled",
    targetEntityType: "AdminWithdrawal",
    targetEntityId: withdrawal._id,
    previousState: { status: "processing" },
    newState: { status: "cancelled", reason: withdrawal.failureReason },
    reason: `Withdrawal cancelled: #${withdrawal.withdrawalNumber}. Funds unlocked.`,
  });

  return {
    success: true,
    withdrawal,
    message: "Withdrawal cancelled successfully and funds restored to available balance.",
  };
}
