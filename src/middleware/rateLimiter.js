import rateLimit from "express-rate-limit";

/**
 * Rate limiter for OTP sending and resending endpoints.
 * Limits IP addresses to 5 requests per 15-minute window.
 */
export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 OTP generation attempts per 15 mins per IP
  standardHeaders: true, // Return standard RateLimit headers
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many OTP requests from this IP address. Please try again after 15 minutes.",
  },
});

/**
 * Rate limiter for login endpoints to prevent brute force password guessing.
 * Limits IP addresses to 10 login attempts per 15-minute window.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 login attempts per 15 mins per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts from this IP address. Please try again after 15 minutes.",
  },
});
