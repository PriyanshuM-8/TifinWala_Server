import InAppNotification from "../Models/InAppNotification.js";
import { createTransporter } from "./emailService.js";

/**
 * Safely send an email notification, falling back gracefully in development mode.
 */
export const sendRewardEmailNotification = async ({
  toEmail,
  name,
  subject,
  messageHtml,
  messageText,
}) => {
  if (!toEmail) return { success: false, reason: "No recipient email provided" };

  const fromName = process.env.SMTP_FROM_NAME || "GharKaSwad Rewards";
  const fromEmail =
    process.env.SMTP_FROM_EMAIL ||
    process.env.SMTP_USER ||
    "rewards@gharkaswad.com";
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (!smtpUser || !smtpPass || smtpPass.includes("your_password")) {
    console.log(
      `[RewardNotificationService:Dev] Mock email to ${toEmail}: [${subject}] - ${messageText}`
    );
    return { success: true, mocked: true };
  }

  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: toEmail.trim().toLowerCase(),
      subject,
      html: messageHtml,
      text: messageText,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(
      `[RewardNotificationService] Email delivery failed to ${toEmail}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Create an in-app notification in MongoDB.
 */
export const createInAppNotification = async ({
  recipientId,
  recipientRole = "customer",
  title,
  message,
  type,
  metadata = {},
}) => {
  try {
    const notification = await InAppNotification.create({
      recipientId,
      recipientRole,
      title,
      message,
      type,
      metadata,
    });
    return notification;
  } catch (error) {
    console.error("[RewardNotificationService] In-app notification creation error:", error.message);
    return null;
  }
};

/**
 * Notify customer that daily loyalty points were credited.
 */
export const notifyLoyaltyPointsEarned = async ({
  user,
  points,
  units,
  scheduledDateKey,
}) => {
  const title = "Loyalty Points Earned! 🌟";
  const message = `Congratulations! You earned ${points.toFixed(4)} loyalty points for completing all scheduled meals on ${scheduledDateKey}.`;

  await createInAppNotification({
    recipientId: user._id,
    recipientRole: "customer",
    title,
    message,
    type: "loyalty_earned",
    metadata: { points, units, scheduledDateKey },
  });

  const messageHtml = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
      <h2 style="color: #d97706;">🌟 GharKaSwad Loyalty Points Earned!</h2>
      <p>Namaste <strong>${user.name || "Foodie"}</strong>,</p>
      <p>${message}</p>
      <p style="background: #fef3c7; padding: 12px; border-left: 4px solid #f59e0b; border-radius: 4px;">
        <strong>Points Credited:</strong> ${points.toFixed(4)} points<br/>
        <strong>Date:</strong> ${scheduledDateKey}
      </p>
      <p>Keep enjoying wholesome homemade food and collect 100 points for a free 1-Day 3-Meal Reward Feast!</p>
    </div>
  `;

  await sendRewardEmailNotification({
    toEmail: user.email,
    name: user.name,
    subject: "GharKaSwad - Loyalty Points Earned!",
    messageHtml,
    messageText: message,
  });
};

/**
 * Notify customer that an automated 100-point Reward Coupon was issued.
 */
export const notifyCouponGenerated = async ({ user, coupon }) => {
  const formattedExpiry = new Date(coupon.expiresAt).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const title = "🎁 Free 1-Day 3-Meal Reward Coupon Unlocked!";
  const message = `Woohoo! You reached 100 loyalty points and unlocked coupon code ${coupon.couponCode}. Valid for 30 days until ${formattedExpiry}.`;

  await createInAppNotification({
    recipientId: user._id,
    recipientRole: "customer",
    title,
    message,
    type: "coupon_generated",
    metadata: {
      couponId: coupon._id,
      couponCode: coupon.couponCode,
      expiresAt: coupon.expiresAt,
    },
  });

  const messageHtml = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
      <h2 style="color: #16a34a;">🎁 Congratulations! 1-Day 3-Meal Reward Coupon Unlocked!</h2>
      <p>Namaste <strong>${user.name || "Foodie"}</strong>,</p>
      <p>You have earned 100 loyalty points on GharKaSwad! We've automatically converted your points into an exclusive reward coupon:</p>
      <div style="text-align: center; margin: 24px 0; background: #ecfdf5; border: 2px dashed #10b981; padding: 16px; border-radius: 8px;">
        <span style="font-size: 24px; font-weight: bold; letter-spacing: 3px; color: #047857;">${coupon.couponCode}</span>
        <div style="font-size: 13px; color: #065f46; margin-top: 6px;">Valid for 1-Day Free Breakfast + Lunch + Dinner from any approved home chef</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Expires on: ${formattedExpiry}</div>
      </div>
      <p>Redeem your reward anytime through your GharKaSwad mobile or web app!</p>
    </div>
  `;

  await sendRewardEmailNotification({
    toEmail: user.email,
    name: user.name,
    subject: "GharKaSwad - Your 100-Point Reward Coupon is Ready!",
    messageHtml,
    messageText: message,
  });
};

/**
 * Notify customer of coupon expiring soon (7 days or 1 day).
 */
export const notifyCouponExpiringSoon = async ({
  user,
  coupon,
  daysRemaining,
}) => {
  const formattedExpiry = new Date(coupon.expiresAt).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const urgencyLabel = daysRemaining === 1 ? "⚠️ Expiring in 24 Hours!" : "⏰ Expiring in 7 Days!";
  const title = `${urgencyLabel} Reward Coupon ${coupon.couponCode}`;
  const message = `Your free 1-Day 3-Meal coupon (${coupon.couponCode}) expires in ${daysRemaining} day(s) on ${formattedExpiry}. Don't miss out on your free homemade feast!`;

  await createInAppNotification({
    recipientId: user._id,
    recipientRole: "customer",
    title,
    message,
    type: "coupon_expiring_soon",
    metadata: {
      couponId: coupon._id,
      couponCode: coupon.couponCode,
      daysRemaining,
      expiresAt: coupon.expiresAt,
    },
  });

  const messageHtml = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
      <h2 style="color: #e11d48;">${urgencyLabel}</h2>
      <p>Namaste <strong>${user.name || "Foodie"}</strong>,</p>
      <p>${message}</p>
      <div style="background: #fff1f2; border: 1px solid #fecdd3; padding: 14px; border-radius: 6px; margin: 18px 0;">
        <strong>Coupon Code:</strong> ${coupon.couponCode}<br/>
        <strong>Valid Until:</strong> ${formattedExpiry}<br/>
        <strong>Includes:</strong> Free Breakfast + Lunch + Dinner from your chosen Home Chef
      </div>
      <p>Order your free meals today before this reward expires!</p>
    </div>
  `;

  await sendRewardEmailNotification({
    toEmail: user.email,
    name: user.name,
    subject: `GharKaSwad Reminder: Reward Coupon ${coupon.couponCode} expires soon!`,
    messageHtml,
    messageText: message,
  });
};

/**
 * Notify customer that coupon has expired.
 */
export const notifyCouponExpired = async ({ user, coupon }) => {
  const title = "Reward Coupon Expired";
  const message = `Your reward coupon ${coupon.couponCode} has expired. Continue enjoying meals on GharKaSwad to earn new loyalty rewards!`;

  await createInAppNotification({
    recipientId: user._id,
    recipientRole: "customer",
    title,
    message,
    type: "coupon_expired",
    metadata: {
      couponId: coupon._id,
      couponCode: coupon.couponCode,
    },
  });
};

/**
 * Notify customer when admin adjusts points.
 */
export const notifyAdminPointsAdjustment = async ({ user, transaction }) => {
  const sign = transaction.transactionType === "credit" ? "+" : "-";
  const title = "Points Balance Adjustment";
  const message = `An administrator has adjusted your loyalty balance by ${sign}${transaction.points.toFixed(4)} points. Reason: ${transaction.auditReason || "Admin update"}. New balance: ${transaction.balanceAfterPoints.toFixed(4)} points.`;

  await createInAppNotification({
    recipientId: user._id,
    recipientRole: "customer",
    title,
    message,
    type: "admin_points_adjustment",
    metadata: {
      transactionId: transaction._id,
      transactionType: transaction.transactionType,
      points: transaction.points,
      auditReason: transaction.auditReason,
    },
  });
};
