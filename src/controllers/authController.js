import {
  customerSendOtpService,
  customerVerifyOtpService,
  chefSendOtpService,
  chefVerifyOtpService,
  resendOtpService,
  loginService,
  adminLoginService,
  getMeService,
} from "../services/authService.js";

const handleServiceError = (error, next) => {
  if (error.status) {
    return { statusCode: error.status, body: { success: false, message: error.message, ...(error.retryAfter && { retryAfter: error.retryAfter }), ...(error.attemptsRemaining !== undefined && { attemptsRemaining: error.attemptsRemaining }) } };
  }
  next(error);
  return null;
};

// 1. Customer Registration - Step 1: Send OTP
// POST /api/auth/customer/register/send-otp
export const customerSendOtp = async (req, res, next) => {
  try {
    const result = await customerSendOtpService(req.body);
    return res.status(200).json({ success: true, message: "A 6-digit verification code has been sent to your email. Code expires in 5 minutes.", email: result.email });
  } catch (error) {
    const handled = handleServiceError(error, next);
    if (handled) return res.status(handled.statusCode).json(handled.body);
  }
};

// 2. Customer Registration - Step 2: Verify OTP
// POST /api/auth/customer/register/verify-otp
export const customerVerifyOtp = async (req, res, next) => {
  try {
    const result = await customerVerifyOtpService(req.body);
    return res.status(201).json({ success: true, message: "Customer registration successful and email verified.", ...result });
  } catch (error) {
    const handled = handleServiceError(error, next);
    if (handled) return res.status(handled.statusCode).json(handled.body);
  }
};

// 3. Chef Registration - Step 1: Send OTP
// POST /api/auth/chef/register/send-otp
export const chefSendOtp = async (req, res, next) => {
  try {
    const result = await chefSendOtpService(req.body);
    return res.status(200).json({ success: true, message: "Chef registration verification code sent to your email. Code expires in 5 minutes.", email: result.email });
  } catch (error) {
    const handled = handleServiceError(error, next);
    if (handled) return res.status(handled.statusCode).json(handled.body);
  }
};

// 4. Chef Registration - Step 2: Verify OTP
// POST /api/auth/chef/register/verify-otp
export const chefVerifyOtp = async (req, res, next) => {
  try {
    const result = await chefVerifyOtpService(req.body);
    return res.status(201).json({ success: true, message: "Chef account registered successfully! Your profile is pending Admin approval before you can start listing homemade dishes.", ...result });
  } catch (error) {
    const handled = handleServiceError(error, next);
    if (handled) return res.status(handled.statusCode).json(handled.body);
  }
};

// 5. Resend OTP
// POST /api/auth/register/resend-otp
export const resendOtp = async (req, res, next) => {
  try {
    const result = await resendOtpService(req.body);
    return res.status(200).json({ success: true, message: "A fresh verification code has been dispatched to your email. Valid for 5 minutes.", email: result.email });
  } catch (error) {
    const handled = handleServiceError(error, next);
    if (handled) return res.status(handled.statusCode).json(handled.body);
  }
};

// 6. Unified Login
// POST /api/auth/login
export const login = async (req, res, next) => {
  try {
    const result = await loginService(req.body);
    return res.status(200).json({ success: true, message: "Login successful.", ...result });
  } catch (error) {
    const handled = handleServiceError(error, next);
    if (handled) return res.status(handled.statusCode).json(handled.body);
  }
};

// 7. Admin Login
// POST /api/auth/admin/login
export const adminLogin = async (req, res, next) => {
  try {
    const result = await adminLoginService(req.body);
    return res.status(200).json({ success: true, message: "Administrator authentication successful.", ...result });
  } catch (error) {
    const handled = handleServiceError(error, next);
    if (handled) return res.status(handled.statusCode).json(handled.body);
  }
};

// 8. Get Current User
// GET /api/auth/me
export const getMe = async (req, res, next) => {
  try {
    const result = await getMeService(req.user);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

// 9. Logout
// POST /api/auth/logout
export const logout = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Logged out successfully. Please clear the authorization token from client storage (localStorage / secure cookies).",
    strategy: "Stateless JWT authentication: The client must discard the token upon logout.",
  });
};
