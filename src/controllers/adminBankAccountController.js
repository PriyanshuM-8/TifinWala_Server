import {
  addAdminBankAccount,
  listAdminBankAccounts,
  getAdminBankAccountById,
  verifyAdminBankAccount,
  setDefaultAdminBankAccount,
  deleteAdminBankAccount,
} from "../Services/adminBankAccountService.js";

/**
 * GET /api/admin/bank-accounts
 * List all active admin bank accounts (masked).
 */
export async function listAdminBankAccountsHandler(req, res, next) {
  try {
    const accounts = await listAdminBankAccounts(req.user._id);
    return res.status(200).json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/bank-accounts
 * Add new bank account with encryption and masking.
 */
export async function addAdminBankAccountHandler(req, res, next) {
  try {
    const account = await addAdminBankAccount(req.user._id, req.body);
    return res.status(201).json({
      success: true,
      data: account,
      message: "Bank account added successfully.",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/bank-accounts/:id
 * Get single bank account details (masked).
 */
export async function getAdminBankAccountHandler(req, res, next) {
  try {
    const account = await getAdminBankAccountById(req.user._id, req.params.id);
    return res.status(200).json({
      success: true,
      data: account,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/bank-accounts/:id/verify
 * Verify an admin bank account.
 */
export async function verifyAdminBankAccountHandler(req, res, next) {
  try {
    const account = await verifyAdminBankAccount(
      req.user._id,
      req.params.id,
      req.body
    );
    return res.status(200).json({
      success: true,
      data: account,
      message: "Bank account verified successfully.",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/bank-accounts/:id/set-default
 * Designate account as the default payout account.
 */
export async function setDefaultAdminBankAccountHandler(req, res, next) {
  try {
    const account = await setDefaultAdminBankAccount(req.user._id, req.params.id);
    return res.status(200).json({
      success: true,
      data: account,
      message: "Default payout bank account updated.",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/bank-accounts/:id
 * Remove / deactivate a bank account.
 */
export async function deleteAdminBankAccountHandler(req, res, next) {
  try {
    const result = await deleteAdminBankAccount(req.user._id, req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
