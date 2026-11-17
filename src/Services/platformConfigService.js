import PlatformConfig from "../Models/PlatformConfig.js";

const DEFAULT_CONFIG = {
  configKey: "global_platform_config",
  onlineDiscountRupees: 20, // ₹20
  codFeeRupees: 20, // ₹20
  standardCommissionRate: 0.1, // 10%
  minimumCommissionWalletBalanceRupees: 50, // ₹50
  minimumWithdrawalRupees: 100, // ₹100
  minimumRechargeRupees: 100, // ₹100
};

/**
 * Get or create the global platform configuration singleton.
 */
export async function getPlatformConfig(session = null) {
  let config = await PlatformConfig.findOne({ configKey: "global_platform_config" }).session(session);
  if (!config) {
    const created = await PlatformConfig.create([DEFAULT_CONFIG], { session });
    config = created[0];
  }
  return config;
}

/**
 * Update platform configuration (Admin only).
 */
export async function updatePlatformConfig(updates, adminUserId, session = null) {
  let config = await PlatformConfig.findOne({ configKey: "global_platform_config" }).session(session);
  if (!config) {
    config = new PlatformConfig(DEFAULT_CONFIG);
  }

  if (updates.onlineDiscountRupees !== undefined) {
    config.onlineDiscountRupees = Number(updates.onlineDiscountRupees);
  }
  if (updates.codFeeRupees !== undefined) {
    config.codFeeRupees = Number(updates.codFeeRupees);
  }
  if (updates.standardCommissionRate !== undefined) {
    config.standardCommissionRate = Number(updates.standardCommissionRate);
  }
  if (updates.minimumCommissionWalletBalanceRupees !== undefined) {
    config.minimumCommissionWalletBalanceRupees = Number(updates.minimumCommissionWalletBalanceRupees);
  }
  if (updates.minimumWithdrawalRupees !== undefined) {
    config.minimumWithdrawalRupees = Number(updates.minimumWithdrawalRupees);
  }
  if (updates.minimumRechargeRupees !== undefined) {
    config.minimumRechargeRupees = Number(updates.minimumRechargeRupees);
  }

  if (adminUserId) {
    config.updatedBy = adminUserId;
  }

  await config.save({ session });
  return config;
}
