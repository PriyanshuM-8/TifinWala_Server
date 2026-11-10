import express from "express";
import {
  customerSendOtp,
  customerVerifyOtp,
  chefSendOtp,
  chefVerifyOtp,
  resendOtp,
  login,
  adminLogin,
  getMe,
  logout,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { otpRateLimiter, loginRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

/**
 * Customer Registration Routes
 */
router.post("/customer/register/send-otp", otpRateLimiter, customerSendOtp);
router.post("/customer/register/verify-otp", customerVerifyOtp);

/**
 * Chef Registration Routes
 */
router.post("/chef/register/send-otp", otpRateLimiter, chefSendOtp);
router.post("/chef/register/verify-otp", chefVerifyOtp);
  
/**
 * Shared OTP Resend Route
 */
router.post("/register/resend-otp", otpRateLimiter, resendOtp);

/**
 * Authentication / Login Routes
 */
router.post("/login", loginRateLimiter, login);
router.post("/admin/login", loginRateLimiter, adminLogin);

/**
 * Protected Profile & Session Management
 */
router.get("/me", protect, getMe);
router.post("/logout", logout);

export default router;
