import crypto from "crypto";
import bcrypt from "bcryptjs";

export const OTP_EXPIRY_MINUTES = 5;
export const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/**
 * Generates a cryptographically secure 6-digit numeric OTP string.
 * Uses Node.js built-in crypto.randomInt to guarantee uniform randomness.
 */
export const generateSecureOTP = () => {
  const otpNumber = crypto.randomInt(100000, 1000000);
  return otpNumber.toString();
};

/**
 * Hashes a 6-digit OTP using bcryptjs with 10 salt rounds.
 * @param {string} otp
 * @returns {Promise<string>}
 */
export const hashOTP = async (otp) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(otp, salt);
};

/**
 * Compares an incoming plain OTP with the stored bcrypt hash.
 * @param {string} candidateOTP
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
export const verifyOTPHash = async (candidateOTP, storedHash) => {
  if (!candidateOTP || !storedHash) return false;
  return bcrypt.compare(candidateOTP.trim(), storedHash);
};
