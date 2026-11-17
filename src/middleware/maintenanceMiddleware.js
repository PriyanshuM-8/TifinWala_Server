import PlatformConfig from "../Models/PlatformConfig.js";

let cachedMaintenanceMode = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 3000; // 3 seconds TTL

async function isMaintenanceModeActive() {
  const now = Date.now();
  if (cachedMaintenanceMode !== null && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedMaintenanceMode;
  }

  try {
    const config = await PlatformConfig.findOne({ configKey: "global_platform_config" })
      .select("maintenanceMode")
      .lean();
    cachedMaintenanceMode = Boolean(config?.maintenanceMode);
    lastCacheTime = now;
    return cachedMaintenanceMode;
  } catch (err) {
    return false;
  }
}

/**
 * Platform Maintenance Middleware.
 * Intercepts customer and chef requests when maintenance mode is toggled on.
 * Keeps root health check, authentication, and all administrative routes accessible.
 */
export async function checkMaintenanceMode(req, res, next) {
  // Always permit root health check, auth, and admin routes
  if (
    req.path === "/" ||
    req.path.startsWith("/api/auth") ||
    req.path.startsWith("/api/admin") ||
    req.path.startsWith("/api/webhooks")
  ) {
    return next();
  }

  const inMaintenance = await isMaintenanceModeActive();
  if (inMaintenance) {
    return res.status(503).json({
      success: false,
      code: "MAINTENANCE_MODE",
      message: "GharKaSwad is currently undergoing scheduled maintenance. Please check back shortly.",
    });
  }

  next();
}
