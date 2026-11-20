import AdminBankAccount from "../Models/AdminBankAccount.js";
import AdminWithdrawal from "../Models/AdminWithdrawal.js";
import {
  encryptText,
  decryptText,
  maskAccountNumber,
  maskIfscCode,
} from "./cryptoService.js";
import { logAdminAction } from "./auditLogService.js";

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * ADMIN: Add a new bank account with encryption and masking.
 */
export async function addAdminBankAccount(adminId, details = {}) {
  const {
    accountHolderName,
    bankName,
    accountNumber,
    confirmAccountNumber,
    ifscCode,
    accountType = "current",
  } = details;

  if (!accountHolderName || String(accountHolderName).trim().length < 3) {
    const err = new Error("Valid account holder name (at least 3 characters) is required.");
    err.statusCode = 400;
    throw err;
  }

  if (!bankName || String(bankName).trim().length < 2) {
    const err = new Error("Valid bank name is required.");
    err.statusCode = 400;
    throw err;
  }

  const cleanAccNum = String(accountNumber || "").trim();
  const cleanConfirmAccNum = String(confirmAccountNumber || "").trim();

  if (!cleanAccNum || cleanAccNum.length < 9 || cleanAccNum.length > 18 || !/^\d+$/.test(cleanAccNum)) {
    const err = new Error("Bank account number must be between 9 and 18 digits.");
    err.statusCode = 400;
    throw err;
  }

  if (cleanAccNum !== cleanConfirmAccNum) {
    const err = new Error("Account number and confirmation account number do not match.");
    err.statusCode = 400;
    throw err;
  }

  const cleanIfsc = String(ifscCode || "").trim().toUpperCase();
  if (!IFSC_REGEX.test(cleanIfsc)) {
    const err = new Error("Invalid IFSC Code format (e.g. HDFC0001234).");
    err.statusCode = 400;
    throw err;
  }

  // Check if admin has existing active accounts
  const existingActiveCount = await AdminBankAccount.countDocuments({
    adminId,
    isActive: true,
  });

  // If this is first account, automatically mark as default
  const isDefault = existingActiveCount === 0;

  const encryptedAccountNumber = encryptText(cleanAccNum);
  const maskedAccountNumber = maskAccountNumber(cleanAccNum);
  const encryptedIfscCode = encryptText(cleanIfsc);
  const maskedIfscCode = maskIfscCode(cleanIfsc);

  const bankAccount = new AdminBankAccount({
    adminId,
    accountHolderName: String(accountHolderName).trim(),
    bankName: String(bankName).trim(),
    encryptedAccountNumber,
    maskedAccountNumber,
    encryptedIfscCode,
    maskedIfscCode,
    accountType: ["current", "savings"].includes(accountType) ? accountType : "current",
    isVerified: false,
    isDefault,
    isActive: true,
  });

  await bankAccount.save();

  await logAdminAction({
    adminId,
    actionType: "admin_bank_account_added",
    targetEntityType: "AdminBankAccount",
    targetEntityId: bankAccount._id,
    previousState: null,
    newState: {
      accountHolderName: bankAccount.accountHolderName,
      bankName: bankAccount.bankName,
      maskedAccountNumber: bankAccount.maskedAccountNumber,
      maskedIfscCode: bankAccount.maskedIfscCode,
      isDefault: bankAccount.isDefault,
    },
    reason: `Admin bank account added: ${bankAccount.bankName} (${bankAccount.maskedAccountNumber})`,
  });

  return formatBankAccountResponse(bankAccount);
}

/**
 * ADMIN: List all active bank accounts (always masked, never reveals raw numbers).
 */
export async function listAdminBankAccounts(adminId) {
  const accounts = await AdminBankAccount.find({
    adminId,
    isActive: true,
  })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();

  return accounts.map(formatBankAccountResponse);
}

/**
 * ADMIN: Get specific bank account details by ID.
 */
export async function getAdminBankAccountById(adminId, bankAccountId) {
  const account = await AdminBankAccount.findOne({
    _id: bankAccountId,
    adminId,
    isActive: true,
  }).lean();

  if (!account) {
    const err = new Error("Bank account not found.");
    err.statusCode = 404;
    throw err;
  }

  return formatBankAccountResponse(account);
}

/**
 * ADMIN: Verify a bank account.
 */
export async function verifyAdminBankAccount(adminId, bankAccountId, { verificationCode = "AUTO" } = {}) {
  const account = await AdminBankAccount.findOne({
    _id: bankAccountId,
    adminId,
    isActive: true,
  });

  if (!account) {
    const err = new Error("Bank account not found.");
    err.statusCode = 404;
    throw err;
  }

  if (account.isVerified) {
    return formatBankAccountResponse(account);
  }

  account.isVerified = true;
  account.verifiedAt = new Date();
  account.verificationMethod = "admin_verified";
  await account.save();

  await logAdminAction({
    adminId,
    actionType: "admin_bank_account_verified",
    targetEntityType: "AdminBankAccount",
    targetEntityId: account._id,
    previousState: { isVerified: false },
    newState: { isVerified: true, verifiedAt: account.verifiedAt },
    reason: `Bank account verified: ${account.bankName} (${account.maskedAccountNumber})`,
  });

  return formatBankAccountResponse(account);
}

/**
 * ADMIN: Set verified account as the default payout account.
 */
export async function setDefaultAdminBankAccount(adminId, bankAccountId) {
  const account = await AdminBankAccount.findOne({
    _id: bankAccountId,
    adminId,
    isActive: true,
  });

  if (!account) {
    const err = new Error("Bank account not found.");
    err.statusCode = 404;
    throw err;
  }

  if (!account.isVerified) {
    const err = new Error("Only verified bank accounts can be set as the default payout account.");
    err.statusCode = 400;
    throw err;
  }

  // Atomically unmark all others and mark this one
  await AdminBankAccount.updateMany(
    { adminId, isActive: true },
    { $set: { isDefault: false } }
  );

  account.isDefault = true;
  await account.save();

  await logAdminAction({
    adminId,
    actionType: "admin_bank_account_default_set",
    targetEntityType: "AdminBankAccount",
    targetEntityId: account._id,
    previousState: null,
    newState: { isDefault: true },
    reason: `Bank account set as default: ${account.bankName} (${account.maskedAccountNumber})`,
  });

  return formatBankAccountResponse(account);
}

/**
 * ADMIN: Remove/Deactivate bank account (blocked if active withdrawal is pending).
 */
export async function deleteAdminBankAccount(adminId, bankAccountId) {
  const account = await AdminBankAccount.findOne({
    _id: bankAccountId,
    adminId,
    isActive: true,
  });

  if (!account) {
    const err = new Error("Bank account not found.");
    err.statusCode = 404;
    throw err;
  }

  // Check if any pending or processing withdrawal is tied to this account
  const activeWithdrawal = await AdminWithdrawal.findOne({
    bankAccountId,
    status: { $in: ["pending", "processing"] },
  });

  if (activeWithdrawal) {
    const err = new Error(
      `Cannot remove bank account while withdrawal #${activeWithdrawal.withdrawalNumber} is in ${activeWithdrawal.status} status.`
    );
    err.statusCode = 400;
    throw err;
  }

  account.isActive = false;
  account.isDefault = false;
  await account.save();

  // If deleted account was default, elect another verified account as default
  const nextAccount = await AdminBankAccount.findOne({
    adminId,
    isActive: true,
    isVerified: true,
  }).sort({ createdAt: -1 });

  if (nextAccount) {
    nextAccount.isDefault = true;
    await nextAccount.save();
  }

  await logAdminAction({
    adminId,
    actionType: "admin_bank_account_removed",
    targetEntityType: "AdminBankAccount",
    targetEntityId: account._id,
    previousState: { isActive: true },
    newState: { isActive: false },
    reason: `Bank account removed: ${account.bankName} (${account.maskedAccountNumber})`,
  });

  return { success: true, message: "Bank account removed successfully." };
}

/**
 * Helper to decrypt account details strictly for internal payout transfer execution.
 * Never exposed to public or client APIs.
 */
export async function getDecryptedAdminBankDetails(bankAccountId) {
  const account = await AdminBankAccount.findById(bankAccountId);
  if (!account) {
    throw new Error("Bank account record not found.");
  }

  return {
    accountHolderName: account.accountHolderName,
    bankName: account.bankName,
    accountNumber: decryptText(account.encryptedAccountNumber),
    ifscCode: decryptText(account.encryptedIfscCode),
    maskedAccountNumber: account.maskedAccountNumber,
    maskedIfscCode: account.maskedIfscCode,
    accountType: account.accountType,
    isVerified: account.isVerified,
    isDefault: account.isDefault,
  };
}

/**
 * Helper to ensure safe JSON presentation with only masked numbers.
 */
function formatBankAccountResponse(doc) {
  return {
    _id: doc._id,
    accountHolderName: doc.accountHolderName,
    bankName: doc.bankName,
    maskedAccountNumber: doc.maskedAccountNumber,
    maskedIfscCode: doc.maskedIfscCode,
    accountType: doc.accountType,
    isVerified: doc.isVerified,
    verifiedAt: doc.verifiedAt,
    verificationMethod: doc.verificationMethod,
    isDefault: doc.isDefault,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
