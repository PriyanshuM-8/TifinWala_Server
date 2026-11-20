import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Extracts real client IP address even when deployed behind reverse proxies,
 * Cloudflare, Render, Railway, AWS ALB, or Docker containers.
 */
export const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const firstIp = forwarded.split(",")[0].trim();
    if (firstIp) return firstIp;
  }
  return (
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.ip ||
    req.socket?.remoteAddress ||
    "127.0.0.1"
  );
};

/**
 * Rate limiter for OTP sending and resending endpoints.
 * Limits client IP + target account to 15 requests per 5-minute window.
 */
export const otpRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes window
  max: 15, // max 15 OTP attempts per 5 mins
  standardHeaders: true, // Return standard RateLimit headers
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    const rawIp = getClientIp(req);
    const normalizedIp = ipKeyGenerator(rawIp);
    const target = (req.body?.email || req.body?.phone || "").toString().trim().toLowerCase();
    return target ? `${normalizedIp}:${target}` : normalizedIp;
  },
  message: {
    success: false,
    message: "Too many verification code requests for this account. Please wait a few minutes before trying again.",
  },
});

/**
 * Rate limiter for login endpoints to prevent brute force attacks.
 * Allows 20 failed login attempts per 5-minute window per IP + account.
 * IMPORTANT: skipSuccessfulRequests is true so legitimate logins NEVER lock out users.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes window
  max: 20, // max 20 failed attempts per 5 mins
  skipSuccessfulRequests: true, // Successful logins DO NOT count against the limit
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    const rawIp = getClientIp(req);
    const normalizedIp = ipKeyGenerator(rawIp);
    const email = (req.body?.email || req.body?.identifier || "").toString().trim().toLowerCase();
    return email ? `${normalizedIp}:${email}` : normalizedIp;
  },
  message: {
    success: false,
    message: "Too many failed login attempts. Please wait 5 minutes before trying again.",
  },
});
