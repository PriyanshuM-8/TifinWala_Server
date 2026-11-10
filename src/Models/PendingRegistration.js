import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { MAX_OTP_ATTEMPTS } from "../utils/generateOTP.js";

const pendingRegistrationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Hashed password is required"],
    },
    accountType: {
      type: String,
      enum: {
        values: ["customer", "chef"],
        message: "{VALUE} is not a valid account type for registration",
      },
      required: [true, "Account type is required"],
    },
    profileData: {
      type: mongoose.Schema.Types.Mixed,
      default: null, // Holds kitchen details if accountType === 'chef'
    },
    otpHash: {
      type: String,
      required: [true, "OTP hash is required"],
    },
    otpExpiresAt: {
      type: Date,
      required: [true, "OTP expiration timestamp is required"],
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastOtpSentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// MongoDB TTL index to automatically purge abandoned pending registrations after 2 hours
pendingRegistrationSchema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 7200 });

// Verify OTP method
pendingRegistrationSchema.methods.verifyOTP = async function (candidateOTP) {
  if (!candidateOTP || !this.otpHash) return false;
  return bcrypt.compare(candidateOTP.toString().trim(), this.otpHash);
};

// Expiry check
pendingRegistrationSchema.methods.isExpired = function () {
  return Date.now() > this.otpExpiresAt.getTime();
};

// Exceeded attempts check
pendingRegistrationSchema.methods.hasExceededAttempts = function () {
  return this.attempts >= MAX_OTP_ATTEMPTS;
};

const PendingRegistration =
  mongoose.models.PendingRegistration || mongoose.model("PendingRegistration", pendingRegistrationSchema);

export default PendingRegistration;
