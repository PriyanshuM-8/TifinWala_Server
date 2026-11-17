import crypto from "node:crypto";
import ChefProfile from "../Models/ChefProfile.js";
import ChefWallet from "../Models/ChefWallet.js";
import WalletWithdrawal from "../Models/WalletWithdrawal.js";
import {
  encryptText,
  decryptText,
  maskAccountNumber,
  maskIfscCode,
} from "./cryptoService.js";
import { getPlatformConfig } from "./platformConfigService.js";
import { logAdminAction } from "./auditLogService.js";

const generateWithdrawalNumber = () => {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `WTH-${timestamp}-${randomSuffix}`;
};

/**
 * CHEF: Set or update encrypted bank / UPI payout details.
 */
export async function updateChefPayoutDetails(chefId, details) {
  const chefProfile = await ChefProfile.findOne({ userId: chefId });
  if (!chefProfile) {
    const err = new Error("Chef profile not found.");
    err.statusCode = 404;
    throw err;
  }

  const { payoutMethod, accountHolderName, accountNumber, ifscCode, bankName, upiId } = details;

  if (!payoutMethod || !["bank_transfer", "upi"].includes(payoutMethod)) {
    const err = new Error("payoutMethod must be either 'bank_transfer' or 'upi'.");
    err.statusCode = 400;
    throw err;
  }

  if (payoutMethod === "bank_transfer") {
    if (!accountHolderName || !accountNumber || !ifscCode) {
      const err = new Error("accountHolderName, accountNumber, and ifscCode are required for bank_transfer.");
      err.statusCode = 400;
      throw err;
    }

    chefProfile.payoutDetails = {
      payoutMethod: "bank_transfer",
      accountHolderName: String(accountHolderName).trim(),
      encryptedAccountNumber: encryptText(String(accountNumber).trim()),
      maskedAccountNumber: maskAccountNumber(accountNumber),
      encryptedIfscCode: encryptText(String(ifscCode).trim().toUpperCase()),
      maskedIfscCode: maskIfscCode(ifscCode),
      bankName: bankName ? String(bankName).trim() : "",
      upiId: null,
      isVerified: true,
      updatedAt: new Date(),
    };
  } else if (payoutMethod === "upi") {
    if (!upiId || !String(upiId).includes("@")) {
      const err = new Error("Valid upiId is required for upi payout method.");
      err.statusCode = 400;
      throw err;
    }

    chefProfile.payoutDetails = {
      payoutMethod: "upi",
      accountHolderName: accountHolderName ? String(accountHolderName).trim() : "",
      encryptedAccountNumber: null,
      maskedAccountNumber: null,
      encryptedIfscCode: null,
      maskedIfscCode: null,
      bankName: null,
      upiId: String(upiId).trim(),
      isVerified: true,
      updatedAt: new Date(),
    };
  }

  await chefProfile.save();

  return {
    success: true,
    payoutDetails: {
      payoutMethod: chefProfile.payoutDetails.payoutMethod,
      accountHolderName: chefProfile.payoutDetails.accountHolderName,
      maskedAccountNumber: chefProfile.payoutDetails.maskedAccountNumber,
      maskedIfscCode: chefProfile.payoutDetails.maskedIfscCode,
      bankName: chefProfile.payoutDetails.bankName,
      upiId: chefProfile.payoutDetails.upiId,
      isVerified: chefProfile.payoutDetails.isVerified,
      updatedAt: chefProfile.payoutDetails.updatedAt,
    },
    message: "Chef payout details updated securely.",
  };
}

/**
 * CHEF: Request a withdrawal from withdrawable earnings.
 */
export async function requestWithdrawal(chefId, amountRupees) {
  const chefProfile = await ChefProfile.findOne({ userId: chefId });
  if (!chefProfile?.payoutDetails?.isVerified) {
    const err = new Error("Please configure and verify your payout details before requesting a withdrawal.");
    err.statusCode = 400;
    throw err;
  }

  const config = await getPlatformConfig();
  const parsedAmount = Number(amountRupees);
  if (isNaN(parsedAmount) || parsedAmount < config.minimumWithdrawalRupees) {
    const err = new Error(
      `Minimum withdrawal amount is ₹${config.minimumWithdrawalRupees} (${config.minimumWithdrawalPaise} paise).`
    );
    err.statusCode = 400;
    throw err;
  }

  const amountPaise = Math.round(parsedAmount * 100);

  let wallet = await ChefWallet.findOne({ chefId });
  if (!wallet || wallet.availableBalancePaise < amountPaise) {
    const currentAvailable = wallet ? wallet.availableBalancePaise : 0;
    const err = new Error(
      `Insufficient withdrawable balance. Requested: ₹${parsedAmount.toFixed(
        2
      )}, Available: ₹${(currentAvailable / 100).toFixed(2)}.`
    );
    err.statusCode = 400;
    throw err;
  }

  // Atomically lock funds in reservedWithdrawalBalance
  wallet.availableBalancePaise -= amountPaise;
  wallet.reservedWithdrawalBalancePaise += amountPaise;
  await wallet.save();

  const details = chefProfile.payoutDetails;
  const payoutSnapshot = {
    payoutMethod: details.payoutMethod,
    accountHolderName: details.accountHolderName,
    maskedAccountNumber: details.maskedAccountNumber,
    maskedIfscCode: details.maskedIfscCode,
    bankName: details.bankName,
    upiId: details.upiId,
  };

  const withdrawal = new WalletWithdrawal({
    withdrawalNumber: generateWithdrawalNumber(),
    chefId,
    amountPaise,
    status: "requested",
    payoutMethod: details.payoutMethod,
    payoutDetails: {
      accountHolderName: details.accountHolderName,
      accountNumber: details.maskedAccountNumber,
      ifscCode: details.maskedIfscCode,
      upiId: details.upiId,
    },
    encryptedPayoutDetails: details.encryptedAccountNumber
      ? `${details.encryptedAccountNumber}|||${details.encryptedIfscCode}`
      : null,
    maskedPayoutDetails: payoutSnapshot,
  });
  await withdrawal.save();

  return {
    success: true,
    withdrawalId: withdrawal._id,
    withdrawalNumber: withdrawal.withdrawalNumber,
    amountPaise,
    amountRupees: parsedAmount,
    status: withdrawal.status,
    remainingAvailableBalancePaise: wallet.availableBalancePaise,
    reservedWithdrawalBalancePaise: wallet.reservedWithdrawalBalancePaise,
    message: "Withdrawal request submitted. Funds are locked pending admin review.",
  };
}

/**
 * ADMIN: Approve withdrawal request.
 */
export async function adminApproveWithdrawal(withdrawalId, adminUserId) {
  const withdrawal = await WalletWithdrawal.findById(withdrawalId);
  if (!withdrawal) {
    const err = new Error("Withdrawal record not found.");
    err.statusCode = 404;
    throw err;
  }

  if (withdrawal.status !== "requested") {
    const err = new Error(`Cannot approve withdrawal in status '${withdrawal.status}'.`);
    err.statusCode = 400;
    throw err;
  }

  withdrawal.status = "approved";
  withdrawal.reviewedBy = adminUserId;
  withdrawal.reviewedAt = new Date();
  await withdrawal.save();

  await logAdminAction({
    adminId: adminUserId,
    actionType: "withdrawal_approval",
    targetEntityType: "WalletWithdrawal",
    targetEntityId: withdrawal._id,
    previousState: { status: "requested" },
    newState: { status: "approved" },
    reason: `Withdrawal #${withdrawal.withdrawalNumber} of ₹${(withdrawal.amountPaise / 100).toFixed(2)} approved.`,
  });

  return {
    success: true,
    withdrawal,
    message: "Withdrawal request approved. Awaiting manual payout execution.",
  };
}

/**
 * ADMIN: Reject withdrawal request and restore funds to chef's available balance.
 */
export async function adminRejectWithdrawal(withdrawalId, adminUserId, reason) {
  const withdrawal = await WalletWithdrawal.findById(withdrawalId);
  if (!withdrawal) {
    const err = new Error("Withdrawal record not found.");
    err.statusCode = 404;
    throw err;
  }

  if (!["requested", "approved"].includes(withdrawal.status)) {
    const err = new Error(`Cannot reject withdrawal in status '${withdrawal.status}'.`);
    err.statusCode = 400;
    throw err;
  }

  // Restore funds
  const wallet = await ChefWallet.findOne({ chefId: withdrawal.chefId });
  if (wallet) {
    wallet.reservedWithdrawalBalancePaise = Math.max(
      0,
      wallet.reservedWithdrawalBalancePaise - withdrawal.amountPaise
    );
    wallet.availableBalancePaise += withdrawal.amountPaise;
    await wallet.save();
  }

  withdrawal.status = "rejected";
  withdrawal.rejectedReason = reason || "Rejected by platform admin.";
  withdrawal.reviewedBy = adminUserId;
  withdrawal.reviewedAt = new Date();
  await withdrawal.save();

  await logAdminAction({
    adminId: adminUserId,
    actionType: "withdrawal_rejection",
    targetEntityType: "WalletWithdrawal",
    targetEntityId: withdrawal._id,
    previousState: { status: "requested" },
    newState: { status: "rejected", rejectedReason: withdrawal.rejectedReason },
    reason: `Withdrawal #${withdrawal.withdrawalNumber} rejected. Reason: ${withdrawal.rejectedReason}`,
  });

  return {
    success: true,
    withdrawal,
    restoredAmountPaise: withdrawal.amountPaise,
    message: "Withdrawal rejected and funds restored to chef's available balance.",
  };
}

/**
 * ADMIN: Record manual bank/UPI payout with UTR reference number.
 */
export async function adminRecordManualPayout(
  withdrawalId,
  adminUserId,
  { utrNumber, referenceId, adminNote }
) {
  if (!utrNumber || String(utrNumber).trim().length < 6) {
    const err = new Error("A valid transaction UTR number (at least 6 characters) is required to record payout.");
    err.statusCode = 400;
    throw err;
  }

  const withdrawal = await WalletWithdrawal.findById(withdrawalId);
  if (!withdrawal) {
    const err = new Error("Withdrawal record not found.");
    err.statusCode = 404;
    throw err;
  }

  if (!["requested", "approved", "processing"].includes(withdrawal.status)) {
    const err = new Error(`Cannot record payout for withdrawal in status '${withdrawal.status}'.`);
    err.statusCode = 400;
    throw err;
  }

  // Deduct from reserved balance and add to settled balance
  const wallet = await ChefWallet.findOne({ chefId: withdrawal.chefId });
  if (wallet) {
    wallet.reservedWithdrawalBalancePaise = Math.max(
      0,
      wallet.reservedWithdrawalBalancePaise - withdrawal.amountPaise
    );
    wallet.settledBalancePaise += withdrawal.amountPaise;
    await wallet.save();
  }

  withdrawal.status = "paid";
  withdrawal.utrNumber = String(utrNumber).trim();
  withdrawal.referenceId = referenceId ? String(referenceId).trim() : null;
  withdrawal.adminNote = adminNote ? String(adminNote).trim() : null;
  withdrawal.reviewedBy = adminUserId;
  withdrawal.paidAt = new Date();
  withdrawal.settledAt = new Date();
  await withdrawal.save();

  await logAdminAction({
    adminId: adminUserId,
    actionType: "withdrawal_payout",
    targetEntityType: "WalletWithdrawal",
    targetEntityId: withdrawal._id,
    previousState: { status: "approved" },
    newState: { status: "paid", utrNumber: withdrawal.utrNumber },
    reason: `Payout recorded for withdrawal #${withdrawal.withdrawalNumber}. UTR: ${withdrawal.utrNumber}`,
  });

  return {
    success: true,
    withdrawal,
    message: "Payout recorded successfully with UTR reference. Wallet balances settled.",
  };
}

/**
 * ADMIN: Decrypt chef bank account for manual transfer execution.
 */
export async function adminGetDecryptedPayoutInfo(withdrawalId) {
  const withdrawal = await WalletWithdrawal.findById(withdrawalId);
  if (!withdrawal) {
    const err = new Error("Withdrawal record not found.");
    err.statusCode = 404;
    throw err;
  }

  let decryptedAccountNumber = null;
  let decryptedIfsc = null;

  if (withdrawal.encryptedPayoutDetails) {
    const parts = withdrawal.encryptedPayoutDetails.split("|||");
    if (parts[0]) decryptedAccountNumber = decryptText(parts[0]);
    if (parts[1]) decryptedIfsc = decryptText(parts[1]);
  }

  return {
    withdrawalId: withdrawal._id,
    withdrawalNumber: withdrawal.withdrawalNumber,
    amountPaise: withdrawal.amountPaise,
    amountRupees: withdrawal.amount,
    payoutMethod: withdrawal.payoutMethod,
    accountHolderName: withdrawal.payoutDetails?.accountHolderName,
    accountNumber: decryptedAccountNumber || withdrawal.payoutDetails?.accountNumber,
    ifscCode: decryptedIfsc || withdrawal.payoutDetails?.ifscCode,
    upiId: withdrawal.payoutDetails?.upiId,
  };
}
