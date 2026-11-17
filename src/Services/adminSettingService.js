import PlatformConfig from "../Models/PlatformConfig.js";
import { logAdminAction } from "./auditLogService.js";

/**
 * Ensures global platform configuration exists and returns it.
 */
export async function getOrCreatePlatformSettings() {
  let config = await PlatformConfig.findOne({ configKey: "global_platform_config" });
  if (!config) {
    config = new PlatformConfig({
      configKey: "global_platform_config",
      onlineDiscountRupees: 20,
      codFeeRupees: 20,
      standardCommissionRate: 0.1,
      minimumCommissionWalletBalanceRupees: 50,
      minimumWithdrawalRupees: 100,
      minimumRechargeRupees: 100,
      maintenanceMode: false,
      couponExpiryDays: 30,
      version: 1,
      changeHistory: [],
    });
    await config.save();
  }
  return config;
}

/**
 * ADMIN: Get current platform configuration with versioning and cutoff documentation.
 */
export async function getPlatformSettings() {
  const config = await getOrCreatePlatformSettings();
  const configObj = config.toObject({ virtuals: true });

  return {
    ...configObj,
    skipCutoffPolicy: "8:00 PM IST previous day",
  };
}

/**
 * ADMIN: Update platform settings with validation, auto-versioning, and audit logging.
 */
export async function updatePlatformSettings(adminUserId, updates = {}) {
  const {
    onlineDiscountRupees,
    codFeeRupees,
    standardCommissionRate,
    minimumCommissionWalletBalanceRupees,
    minimumWithdrawalRupees,
    minimumRechargeRupees,
    maintenanceMode,
    couponExpiryDays,
    reason,
  } = updates;

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    const error = new Error("A valid reason (minimum 3 characters) is required to update platform settings.");
    error.statusCode = 400;
    throw error;
  }

  const config = await getOrCreatePlatformSettings();

  const previousState = {
    onlineDiscountRupees: config.onlineDiscountRupees,
    codFeeRupees: config.codFeeRupees,
    standardCommissionRate: config.standardCommissionRate,
    minimumCommissionWalletBalanceRupees: config.minimumCommissionWalletBalanceRupees,
    minimumWithdrawalRupees: config.minimumWithdrawalRupees,
    minimumRechargeRupees: config.minimumRechargeRupees,
    maintenanceMode: config.maintenanceMode,
    couponExpiryDays: config.couponExpiryDays,
    version: config.version || 1,
  };

  const changedFields = {};

  if (onlineDiscountRupees !== undefined) {
    const val = Number(onlineDiscountRupees);
    if (isNaN(val) || val < 0) {
      const err = new Error("onlineDiscountRupees must be a non-negative number.");
      err.statusCode = 400;
      throw err;
    }
    config.onlineDiscountRupees = val;
    changedFields.onlineDiscountRupees = val;
  }

  if (codFeeRupees !== undefined) {
    const val = Number(codFeeRupees);
    if (isNaN(val) || val < 0) {
      const err = new Error("codFeeRupees must be a non-negative number.");
      err.statusCode = 400;
      throw err;
    }
    config.codFeeRupees = val;
    changedFields.codFeeRupees = val;
  }

  if (standardCommissionRate !== undefined) {
    const val = Number(standardCommissionRate);
    if (isNaN(val) || val < 0 || val > 1) {
      const err = new Error("standardCommissionRate must be a decimal between 0 and 1 (e.g. 0.10 for 10%).");
      err.statusCode = 400;
      throw err;
    }
    config.standardCommissionRate = val;
    changedFields.standardCommissionRate = val;
  }

  if (minimumCommissionWalletBalanceRupees !== undefined) {
    const val = Number(minimumCommissionWalletBalanceRupees);
    if (isNaN(val) || val < 0) {
      const err = new Error("minimumCommissionWalletBalanceRupees must be non-negative.");
      err.statusCode = 400;
      throw err;
    }
    config.minimumCommissionWalletBalanceRupees = val;
    changedFields.minimumCommissionWalletBalanceRupees = val;
  }

  if (minimumWithdrawalRupees !== undefined) {
    const val = Number(minimumWithdrawalRupees);
    if (isNaN(val) || val < 1) {
      const err = new Error("minimumWithdrawalRupees must be at least ₹1.");
      err.statusCode = 400;
      throw err;
    }
    config.minimumWithdrawalRupees = val;
    changedFields.minimumWithdrawalRupees = val;
  }

  if (minimumRechargeRupees !== undefined) {
    const val = Number(minimumRechargeRupees);
    if (isNaN(val) || val < 1) {
      const err = new Error("minimumRechargeRupees must be at least ₹1.");
      err.statusCode = 400;
      throw err;
    }
    config.minimumRechargeRupees = val;
    changedFields.minimumRechargeRupees = val;
  }

  if (maintenanceMode !== undefined) {
    config.maintenanceMode = Boolean(maintenanceMode);
    changedFields.maintenanceMode = config.maintenanceMode;
  }

  if (couponExpiryDays !== undefined) {
    const val = Number(couponExpiryDays);
    if (isNaN(val) || val < 1) {
      const err = new Error("couponExpiryDays must be at least 1 day.");
      err.statusCode = 400;
      throw err;
    }
    config.couponExpiryDays = val;
    changedFields.couponExpiryDays = val;
  }

  // Increment version
  const newVersion = (config.version || 1) + 1;
  config.version = newVersion;
  config.updatedBy = adminUserId;

  if (!Array.isArray(config.changeHistory)) {
    config.changeHistory = [];
  }

  config.changeHistory.push({
    version: newVersion,
    updatedBy: adminUserId,
    changes: changedFields,
    reason: reason.trim(),
    updatedAt: new Date(),
  });

  await config.save();

  const newState = {
    ...previousState,
    ...changedFields,
    version: newVersion,
  };

  // Record audit log
  await logAdminAction({
    adminId: adminUserId,
    actionType: "platform_config_update",
    targetEntityType: "PlatformConfig",
    targetEntityId: config._id,
    previousState,
    newState,
    reason: `Platform configuration updated to version ${newVersion}. Reason: ${reason.trim()}`,
    metadata: { changedFields },
  });

  return config.toObject({ virtuals: true });
}
