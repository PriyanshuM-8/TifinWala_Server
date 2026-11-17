import {
  getPlatformSettings,
  updatePlatformSettings,
} from "../Services/adminSettingService.js";

/**
 * GET /api/admin/settings
 */
export async function getSettingsHandler(req, res, next) {
  try {
    const settings = await getPlatformSettings();
    return res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/settings
 */
export async function updateSettingsHandler(req, res, next) {
  try {
    const settings = await updatePlatformSettings(req.user._id, req.body);
    return res.status(200).json({
      success: true,
      message: `Platform settings successfully updated to version ${settings.version}.`,
      settings,
    });
  } catch (error) {
    next(error);
  }
}
