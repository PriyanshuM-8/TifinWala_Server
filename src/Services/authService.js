import validator from "validator";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import PendingRegistration from "../models/PendingRegistration.js";
import ChefProfile from "../models/ChefProfile.js";
import {
  generateSecureOTP,
  hashOTP,
  OTP_EXPIRY_MS,
  MAX_OTP_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from "../utils/generateOTP.js";
import { generateToken } from "../utils/token.js";
import { sendOtpEmail } from "./emailService.js";

const isValidPhone = (phone) => {
  if (!phone || typeof phone !== "string") return false;
  const cleaned = phone.replace(/[\s-]/g, "");
  return /^(?:\+?91)?[6-9]\d{9}$/.test(cleaned) || /^\+?[1-9]\d{9,14}$/.test(cleaned);
};

const isStrongPassword = (password) => {
  if (!password || typeof password !== "string") return false;
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  );
};

const validateAndNormalizeEmail = (email) => {
  if (!validator.isEmail(email)) throw { status: 400, message: "Please provide a valid email address." };
  return validator.normalizeEmail(email, { gmail_remove_dots: false }) || email.trim().toLowerCase();
};

const checkResendCooldown = (existingPending) => {
  if (!existingPending) return;
  const secondsSinceLast = Math.floor((Date.now() - existingPending.lastOtpSentAt.getTime()) / 1000);
  if (secondsSinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
    const remaining = OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLast;
    throw { status: 429, message: `Please wait ${remaining} seconds before requesting a new verification code.`, retryAfter: remaining };
  }
};

const generateAndSaveOtp = async (email, data) => {
  const plainOtp = generateSecureOTP();
  const otpHash = await hashOTP(plainOtp);
  const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await PendingRegistration.findOneAndUpdate(
    { email },
    { ...data, otpHash, otpExpiresAt, attempts: 0, lastOtpSentAt: new Date() },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  return plainOtp;
};

// ─── Customer Send OTP ───────────────────────────────────────────────────────

export const customerSendOtpService = async ({ name, email, phone, password, confirmPassword, role }) => {
  if (role && role !== "customer") throw { status: 403, message: "Invalid role specified. Role cannot be elevated." };
  if (!name || !email || !phone || !password) throw { status: 400, message: "All fields (name, email, phone, password) are required." };

  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 60) throw { status: 400, message: "Name must be between 2 and 60 characters." };

  const normalizedEmail = validateAndNormalizeEmail(email);
  const cleanedPhone = phone.trim();
  if (!isValidPhone(cleanedPhone)) throw { status: 400, message: "Please provide a valid 10-digit mobile phone number." };
  if (!isStrongPassword(password)) throw { status: 400, message: "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number." };
  if (confirmPassword !== undefined && password !== confirmPassword) throw { status: 400, message: "Password and Confirm Password do not match." };

  const existingUser = await User.findOne({ $or: [{ email: normalizedEmail }, { phone: cleanedPhone }] });
  if (existingUser) {
    const field = existingUser.email === normalizedEmail ? "email" : "phone number";
    throw { status: 409, message: `An account with this ${field} already exists. Please log in instead.` };
  }

  const existingPending = await PendingRegistration.findOne({ email: normalizedEmail });
  checkResendCooldown(existingPending);

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const plainOtp = await generateAndSaveOtp(normalizedEmail, {
    name: trimmedName,
    email: normalizedEmail,
    phone: cleanedPhone,
    password: hashedPassword,
    accountType: "customer",
    profileData: null,
  });

  await sendOtpEmail({ email: normalizedEmail, name: trimmedName, otp: plainOtp, accountType: "customer" });

  return { email: normalizedEmail };
};

// ─── Customer Verify OTP ─────────────────────────────────────────────────────

export const customerVerifyOtpService = async ({ email, otp }) => {
  if (!email || !otp) throw { status: 400, message: "Email and 6-digit verification code (OTP) are required." };

  const normalizedEmail = email.trim().toLowerCase();
  const cleanedOtp = otp.toString().trim();
  if (!/^\d{6}$/.test(cleanedOtp)) throw { status: 400, message: "Verification code must be a 6-digit numeric code." };

  const pending = await PendingRegistration.findOne({ email: normalizedEmail, accountType: "customer" });
  if (!pending) throw { status: 400, message: "No pending registration found for this email, or registration has expired. Please initiate registration again." };

  if (pending.attempts >= MAX_OTP_ATTEMPTS) {
    await PendingRegistration.deleteOne({ _id: pending._id });
    throw { status: 429, message: "Maximum verification attempts exceeded. Pending registration cancelled for security. Please register again." };
  }

  if (pending.isExpired()) throw { status: 400, message: "Verification code has expired. Please request a new code using the resend endpoint." };

  pending.attempts += 1;
  const isOtpValid = await pending.verifyOTP(cleanedOtp);
  if (!isOtpValid) {
    await pending.save();
    const attemptsRemaining = MAX_OTP_ATTEMPTS - pending.attempts;
    throw { status: 400, message: `Invalid verification code. You have ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining.`, attemptsRemaining };
  }

  const duplicateUser = await User.findOne({ $or: [{ email: pending.email }, { phone: pending.phone }] });
  if (duplicateUser) {
    await PendingRegistration.deleteOne({ _id: pending._id });
    throw { status: 409, message: "An account with this email or phone was already completed. Please log in." };
  }

  const user = await new User({
    name: pending.name,
    email: pending.email,
    phone: pending.phone,
    password: pending.password,
    role: "customer",
    emailVerified: true,
    isActive: true,
  }).save();

  await PendingRegistration.deleteOne({ _id: pending._id });

  const token = generateToken({ id: user._id, role: user.role, email: user.email });

  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, emailVerified: user.emailVerified, isActive: user.isActive, createdAt: user.createdAt },
  };
};

// ─── Chef Send OTP ───────────────────────────────────────────────────────────

export const chefSendOtpService = async ({ name, email, phone, password, confirmPassword, role, kitchenName, ownerName, kitchenAddress, city, description, foodCategories, cuisineTypes, foodSafetyDetails }) => {
  if (role && role !== "chef") throw { status: 403, message: "Invalid role specified. Role cannot be elevated." };
  if (!name || !email || !phone || !password) throw { status: 400, message: "Account details (name, email, phone, password) are all required." };
  if (!kitchenName || !ownerName || !kitchenAddress || !city) throw { status: 400, message: "Kitchen details (kitchenName, ownerName, kitchenAddress, city) are all required." };

  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 60) throw { status: 400, message: "Chef name must be between 2 and 60 characters." };

  const normalizedEmail = validateAndNormalizeEmail(email);
  const cleanedPhone = phone.trim();
  if (!isValidPhone(cleanedPhone)) throw { status: 400, message: "Please provide a valid 10-digit mobile phone number." };
  if (!isStrongPassword(password)) throw { status: 400, message: "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number." };
  if (confirmPassword !== undefined && password !== confirmPassword) throw { status: 400, message: "Password and Confirm Password do not match." };

  const existingUser = await User.findOne({ $or: [{ email: normalizedEmail }, { phone: cleanedPhone }] });
  if (existingUser) {
    const field = existingUser.email === normalizedEmail ? "email" : "phone number";
    throw { status: 409, message: `An account with this ${field} already exists. Please log in instead.` };
  }

  const existingPending = await PendingRegistration.findOne({ email: normalizedEmail });
  checkResendCooldown(existingPending);

  const parsedFoodCategories = Array.isArray(foodCategories)
    ? foodCategories
    : typeof foodCategories === "string"
    ? foodCategories.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const parsedCuisineTypes = Array.isArray(cuisineTypes)
    ? cuisineTypes
    : typeof cuisineTypes === "string"
    ? cuisineTypes.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const profileData = {
    kitchenName: kitchenName.trim(),
    ownerName: ownerName.trim(),
    kitchenAddress: kitchenAddress.trim(),
    city: city.trim(),
    description: description ? description.trim() : "",
    foodCategories: parsedFoodCategories,
    cuisineTypes: parsedCuisineTypes,
    foodSafetyDetails: foodSafetyDetails ? foodSafetyDetails.trim() : "",
  };

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const plainOtp = await generateAndSaveOtp(normalizedEmail, {
    name: trimmedName,
    email: normalizedEmail,
    phone: cleanedPhone,
    password: hashedPassword,
    accountType: "chef",
    profileData,
  });

  await sendOtpEmail({ email: normalizedEmail, name: trimmedName, otp: plainOtp, accountType: "chef" });

  return { email: normalizedEmail };
};

// ─── Chef Verify OTP ─────────────────────────────────────────────────────────

export const chefVerifyOtpService = async ({ email, otp }) => {
  if (!email || !otp) throw { status: 400, message: "Email and 6-digit verification code are required." };

  const normalizedEmail = email.trim().toLowerCase();
  const cleanedOtp = otp.toString().trim();
  if (!/^\d{6}$/.test(cleanedOtp)) throw { status: 400, message: "Verification code must be a 6-digit numeric code." };

  const pending = await PendingRegistration.findOne({ email: normalizedEmail, accountType: "chef" });
  if (!pending) throw { status: 400, message: "No pending chef registration found for this email. Please initiate registration again." };

  if (pending.attempts >= MAX_OTP_ATTEMPTS) {
    await PendingRegistration.deleteOne({ _id: pending._id });
    throw { status: 429, message: "Maximum verification attempts exceeded. Registration cancelled. Please register again." };
  }

  if (pending.isExpired()) throw { status: 400, message: "Verification code has expired. Please request a new code using the resend endpoint." };

  pending.attempts += 1;
  const isOtpValid = await pending.verifyOTP(cleanedOtp);
  if (!isOtpValid) {
    await pending.save();
    const attemptsRemaining = MAX_OTP_ATTEMPTS - pending.attempts;
    throw { status: 400, message: `Invalid verification code. You have ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining.`, attemptsRemaining };
  }

  const duplicateUser = await User.findOne({ $or: [{ email: pending.email }, { phone: pending.phone }] });
  if (duplicateUser) {
    await PendingRegistration.deleteOne({ _id: pending._id });
    throw { status: 409, message: "An account with this email or phone was already completed. Please log in." };
  }

  const user = await new User({
    name: pending.name,
    email: pending.email,
    phone: pending.phone,
    password: pending.password,
    role: "chef",
    emailVerified: true,
    isActive: true,
  }).save();

  const chefProfile = await ChefProfile.create({
    userId: user._id,
    kitchenName: pending.profileData?.kitchenName || "Homemade Kitchen",
    ownerName: pending.profileData?.ownerName || pending.name,
    kitchenAddress: pending.profileData?.kitchenAddress || "Address",
    city: pending.profileData?.city || "City",
    description: pending.profileData?.description || "",
    foodCategories: pending.profileData?.foodCategories || [],
    cuisineTypes: pending.profileData?.cuisineTypes || [],
    foodSafetyDetails: pending.profileData?.foodSafetyDetails || "",
    approvalStatus: "pending",
    rejectionReason: null,
  });

  await PendingRegistration.deleteOne({ _id: pending._id });

  const token = generateToken({ id: user._id, role: user.role, email: user.email });

  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, emailVerified: user.emailVerified, isActive: user.isActive, createdAt: user.createdAt },
    chefProfile: { id: chefProfile._id, kitchenName: chefProfile.kitchenName, ownerName: chefProfile.ownerName, kitchenAddress: chefProfile.kitchenAddress, city: chefProfile.city, foodCategories: chefProfile.foodCategories, cuisineTypes: chefProfile.cuisineTypes, approvalStatus: chefProfile.approvalStatus },
  };
};

// ─── Resend OTP ──────────────────────────────────────────────────────────────

export const resendOtpService = async ({ email }) => {
  if (!email) throw { status: 400, message: "Email is required to resend verification code." };

  const normalizedEmail = email.trim().toLowerCase();
  const pending = await PendingRegistration.findOne({ email: normalizedEmail });
  if (!pending) throw { status: 404, message: "No pending registration found for this email. Please initiate registration first." };

  checkResendCooldown(pending);

  const plainOtp = generateSecureOTP();
  const otpHash = await hashOTP(plainOtp);

  pending.otpHash = otpHash;
  pending.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  pending.attempts = 0;
  pending.lastOtpSentAt = new Date();
  await pending.save();

  await sendOtpEmail({ email: pending.email, name: pending.name, otp: plainOtp, accountType: pending.accountType });

  return { email: pending.email };
};

// ─── Login ───────────────────────────────────────────────────────────────────

export const loginService = async ({ email, password }) => {
  if (!email || !password) throw { status: 400, message: "Email and password are required." };

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select("+password");

  if (!user || !(await user.comparePassword(password))) throw { status: 401, message: "Invalid email or password." };
  if (!user.isActive) throw { status: 403, message: "Your account has been deactivated. Please contact support." };
  if (!user.emailVerified) throw { status: 403, message: "Email address not verified. Please complete verification before logging in." };

  let chefProfile = null;
  if (user.role === "chef") chefProfile = await ChefProfile.findOne({ userId: user._id });

  const token = generateToken({ id: user._id, role: user.role, email: user.email });

  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, emailVerified: user.emailVerified, isActive: user.isActive },
    ...(chefProfile && { chefProfile: { id: chefProfile._id, kitchenName: chefProfile.kitchenName, ownerName: chefProfile.ownerName, approvalStatus: chefProfile.approvalStatus, rejectionReason: chefProfile.rejectionReason } }),
  };
};

// ─── Admin Login ─────────────────────────────────────────────────────────────

export const adminLoginService = async ({ email, password }) => {
  if (!email || !password) throw { status: 400, message: "Administrator email and password are required." };

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select("+password");

  if (!user || !(await user.comparePassword(password))) throw { status: 401, message: "Invalid administrator credentials." };
  if (user.role !== "admin") throw { status: 403, message: "Access forbidden: This portal is strictly for GharKaSwad administrators." };
  if (!user.isActive) throw { status: 403, message: "Administrator account is deactivated. Contact superadmin." };

  const token = generateToken({ id: user._id, role: "admin", email: user.email });

  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, isActive: user.isActive },
  };
};

// ─── Get Me ──────────────────────────────────────────────────────────────────

export const getMeService = async (user) => {
  let chefProfile = null;
  if (user.role === "chef") chefProfile = await ChefProfile.findOne({ userId: user._id });

  return {
    user: { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, emailVerified: user.emailVerified, isActive: user.isActive, createdAt: user.createdAt },
    ...(chefProfile && { chefProfile }),
  };
};
