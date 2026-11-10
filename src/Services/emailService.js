import nodemailer from "nodemailer";
// Brevo imports preserved for commented reference
// import { BREVO_CONFIG, getBrevoHeaders } from "../Config/brevo.js";

/**
 * Builds the responsive HTML template for GharKaSwad verification email.
 * @param {object} params
 * @param {string} params.name - Recipient's name
 * @param {string} params.otp - Six-digit OTP
 * @param {string} params.accountType - 'customer' or 'chef'
 * @returns {string} - HTML content
 */
export const buildOtpEmailTemplate = ({ name, otp, accountType }) => {
  const roleLabel = accountType === "chef" ? "Home Chef Partner" : "Customer";
  const welcomeText =
    accountType === "chef"
      ? "Thank you for partnering with GharKaSwad to share your homely culinary passion with hungry food lovers."
      : "Welcome to GharKaSwad! You are just one step away from enjoying authentic home-cooked meals delivered with love.";

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GharKaSwad Verification Code</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #1e293b;
      }
      .container {
        max-width: 580px;
        margin: 30px auto;
        background: #ffffff;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 12px rgba(0,0,0,0.06);
        border: 1px solid #e2e8f0;
      }
      .header {
        background: linear-gradient(135deg, #d97706, #b45309);
        padding: 32px 24px;
        text-align: center;
        color: #ffffff;
      }
      .brand-title {
        margin: 0;
        font-size: 28px;
        font-weight: 800;
        letter-spacing: 0.5px;
      }
      .tagline {
        margin: 6px 0 0 0;
        font-size: 14px;
        font-style: italic;
        opacity: 0.92;
      }
      .content {
        padding: 32px 28px;
      }
      .greeting {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 12px;
        color: #0f172a;
      }
      .message {
        font-size: 15px;
        line-height: 1.6;
        color: #475569;
        margin-bottom: 24px;
      }
      .otp-box {
        text-align: center;
        background: #fffbeb;
        border: 2px dashed #f59e0b;
        border-radius: 10px;
        padding: 20px 10px;
        margin: 24px 0;
      }
      .otp-title {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        color: #92400e;
        margin-bottom: 6px;
        font-weight: 700;
      }
      .otp-code {
        font-size: 36px;
        font-weight: 800;
        letter-spacing: 8px;
        color: #b45309;
        margin: 0;
        font-family: 'Courier New', Courier, monospace;
      }
      .otp-meta {
        font-size: 13px;
        color: #b45309;
        margin-top: 8px;
        font-weight: 500;
      }
      .warning-box {
        background-color: #fef2f2;
        border-left: 4px solid #ef4444;
        padding: 14px 16px;
        border-radius: 4px;
        margin-top: 24px;
      }
      .warning-text {
        font-size: 13px;
        line-height: 1.5;
        color: #991b1b;
        margin: 0;
      }
      .footer {
        background-color: #f8fafc;
        border-top: 1px solid #e2e8f0;
        padding: 20px;
        text-align: center;
        font-size: 12px;
        color: #94a3b8;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 class="brand-title">🍲 GharKaSwad</h1>
        <p class="tagline">Ghar ka khana, apno jaisa sukoon.</p>
      </div>

      <div class="content">
        <div class="greeting">Namaste, ${name}!</div>
        <p class="message">
          ${welcomeText}
        </p>
        <p class="message">
          Please use the following One-Time Password (OTP) to complete your <strong>${roleLabel}</strong> registration:
        </p>

        <div class="otp-box">
          <div class="otp-title">Your 6-Digit Verification Code</div>
          <p class="otp-code">${otp}</p>
          <div class="otp-meta">⏳ Valid for the next 5 minutes only</div>
        </div>

        <div class="warning-box">
          <p class="warning-text">
            <strong>🔒 Security Alert:</strong> For your safety, do NOT share this OTP with anyone, including GharKaSwad executives. We will never ask for your verification code.
          </p>
        </div>

        <p class="message" style="margin-top: 24px; font-size: 13px; color: #64748b;">
          If you did not initiate this request, you can safely ignore this email. No account will be created without this verification code.
        </p>
      </div>

      <div class="footer">
        &copy; ${new Date().getFullYear()} GharKaSwad. All rights reserved.<br>
        Ghar ka khana, apno jaisa sukoon.
      </div>
    </div>
  </body>
  </html>
  `;
};

/**
 * Builds the responsive HTML template for Chef Application Status (Approve/Reject)
 * @param {object} params
 * @param {string} params.name - Chef's name
 * @param {string} params.kitchenName - Kitchen name
 * @param {string} params.status - 'approved' | 'rejected'
 * @param {string} [params.rejectionReason] - Reason if rejected
 * @returns {string} - HTML content
 */
export const buildChefStatusEmailTemplate = ({ name, kitchenName, status, rejectionReason }) => {
  const isApproved = status === "approved";
  const headerGradient = isApproved
    ? "linear-gradient(135deg, #059669, #047857)"
    : "linear-gradient(135deg, #dc2626, #b91c1c)";
  const statusBadgeBg = isApproved ? "#ecfdf5" : "#fef2f2";
  const statusBadgeBorder = isApproved ? "#10b981" : "#ef4444";
  const statusBadgeColor = isApproved ? "#065f46" : "#991b1b";
  const statusText = isApproved ? "Application Approved 🎉" : "Application Status: Action Required";

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GharKaSwad Chef Application Status</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #1e293b;
      }
      .container {
        max-width: 580px;
        margin: 30px auto;
        background: #ffffff;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 12px rgba(0,0,0,0.06);
        border: 1px solid #e2e8f0;
      }
      .header {
        background: ${headerGradient};
        padding: 32px 24px;
        text-align: center;
        color: #ffffff;
      }
      .brand-title {
        margin: 0;
        font-size: 28px;
        font-weight: 800;
        letter-spacing: 0.5px;
      }
      .tagline {
        margin: 6px 0 0 0;
        font-size: 14px;
        font-style: italic;
        opacity: 0.92;
      }
      .content {
        padding: 32px 28px;
      }
      .greeting {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 12px;
        color: #0f172a;
      }
      .message {
        font-size: 15px;
        line-height: 1.6;
        color: #475569;
        margin-bottom: 20px;
      }
      .status-box {
        text-align: center;
        background: ${statusBadgeBg};
        border: 2px solid ${statusBadgeBorder};
        border-radius: 10px;
        padding: 18px 12px;
        margin: 22px 0;
      }
      .status-title {
        font-size: 20px;
        font-weight: 800;
        color: ${statusBadgeColor};
        margin: 0;
      }
      .status-subtitle {
        font-size: 14px;
        color: ${statusBadgeColor};
        margin-top: 6px;
        font-weight: 600;
      }
      .reason-box {
        background-color: #fff1f2;
        border-left: 4px solid #f43f5e;
        padding: 14px 16px;
        border-radius: 4px;
        margin: 18px 0;
      }
      .reason-title {
        font-weight: 700;
        color: #9f1239;
        margin: 0 0 6px 0;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .reason-text {
        color: #881337;
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
      }
      .footer {
        background-color: #f8fafc;
        border-top: 1px solid #e2e8f0;
        padding: 20px;
        text-align: center;
        font-size: 12px;
        color: #94a3b8;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 class="brand-title">🍲 GharKaSwad</h1>
        <p class="tagline">Ghar ka khana, apno jaisa sukoon.</p>
      </div>

      <div class="content">
        <div class="greeting">Namaste, ${name}!</div>

        <div class="status-box">
          <p class="status-title">${statusText}</p>
          <div class="status-subtitle">Kitchen: <strong>${kitchenName}</strong></div>
        </div>

        ${
          isApproved
            ? `
          <p class="message">
            Congratulations! Your home chef application for <strong>${kitchenName}</strong> has been officially approved by the GharKaSwad team.
          </p>
          <p class="message">
            Your kitchen operations and food listing privileges are now fully unlocked. You can log in to your account, manage your food menu, and start sharing authentic homemade flavours with your neighborhood.
          </p>
          `
            : `
          <p class="message">
            Thank you for applying to partner with GharKaSwad. Following review by our onboarding team, your kitchen application for <strong>${kitchenName}</strong> could not be approved at this time.
          </p>

          <div class="reason-box">
            <div class="reason-title">Reason for Decision:</div>
            <p class="reason-text">${rejectionReason || "Please review and complete your kitchen details."}</p>
          </div>

          <p class="message">
            You can update your kitchen profile information, address, or safety credentials through your chef profile and resubmit for re-evaluation.
          </p>
          `
        }

        <p class="message" style="margin-top: 24px; font-size: 13px; color: #64748b;">
          If you have any questions or require assistance, please reach out to our Chef Support Team.
        </p>
      </div>

      <div class="footer">
        &copy; ${new Date().getFullYear()} GharKaSwad. All rights reserved.<br>
        Ghar ka khana, apno jaisa sukoon.
      </div>
    </div>
  </body>
  </html>
  `;
};

/**
 * Sends chef application status notification email (Approve / Reject).
 * Ensures email delivery failures are caught and logged without aborting database operations.
 *
 * @param {object} params
 * @param {string} params.email - Chef email
 * @param {string} params.name - Chef name
 * @param {string} params.kitchenName - Kitchen name
 * @param {string} params.status - 'approved' | 'rejected'
 * @param {string} [params.rejectionReason] - Reason if rejected
 * @returns {Promise<object>}
 */
export const sendChefStatusEmail = async ({
  email,
  name,
  kitchenName,
  status,
  rejectionReason,
}) => {
  const fromName = process.env.SMTP_FROM_NAME || "GharKaSwad";
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "noreply@gharkaswad.com";
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  const isApproved = status === "approved";
  const subject = isApproved
    ? `🎉 GharKaSwad - Your Kitchen '${kitchenName}' is Approved!`
    : `GharKaSwad - Update Regarding Your Kitchen '${kitchenName}' Application`;

  const html = buildChefStatusEmailTemplate({
    name,
    kitchenName,
    status,
    rejectionReason,
  });

  // Mock / Log in development if SMTP credentials are missing
  if (!smtpUser || !smtpPass || smtpPass.includes("your_password")) {
    console.warn(
      `[EmailService:Development Mode] SMTP not fully configured. Chef status email mocked for: ${email} (${status})`
    );
    return { success: true, mocked: true };
  }

  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: email.trim().toLowerCase(),
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `[EmailService] Chef ${status} notification sent to ${email} (MessageId: ${info.messageId})`
    );
    return { success: true, messageId: info.messageId };
  } catch (error) {
    // Log failure but DO NOT throw, allowing caller DB operation to succeed
    console.error(
      `[EmailService] Non-fatal: Failed to send ${status} email to ${email}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Supports Gmail directly or any custom SMTP provider (Brevo SMTP, Hostinger, Mailgun, etc.).
 */
export const createTransporter = () => {
  const service = process.env.SMTP_SERVICE;
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = (process.env.SMTP_USER || process.env.EMAIL_USER || "").trim();
  const pass = (process.env.SMTP_PASS || process.env.EMAIL_PASS || "").trim();

  // If using Gmail directly (requires 16-character Google App Password)
  if (service && service.toLowerCase() === "gmail") {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }

  // Standard SMTP configuration
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

/**
 * Sends a transactional verification email containing a 6-digit OTP using Nodemailer.
 *
 * @param {object} params
 * @param {string} params.email - Recipient email
 * @param {string} params.name - Recipient name
 * @param {string} params.otp - Six digit OTP string
 * @param {string} params.accountType - 'customer' | 'chef'
 * @returns {Promise<object>}
 */
export const sendOtpEmail = async ({ email, name, otp, accountType = "customer" }) => {
  const fromName = process.env.SMTP_FROM_NAME || "GharKaSwad";
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "noreply@gharkaswad.com";
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  // Development check if SMTP credentials are missing
  if (!smtpUser || !smtpPass || smtpPass.includes("your_password")) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[EmailService:Development Mode] SMTP_USER or SMTP_PASS is not configured in .env. Mocking OTP dispatch for: ${email}`
      );
      return { success: true, mocked: true, message: "Mock OTP email sent in development mode" };
    } else {
      throw new Error("SMTP_USER and SMTP_PASS must be configured in environment variables");
    }
  }

  const subject = `GharKaSwad - Verify Your ${
    accountType === "chef" ? "Chef Partner" : "Customer"
  } Account`;

  const htmlContent = buildOtpEmailTemplate({ name, otp, accountType });

  // -------------------------------------------------------------
  // [ACTIVE: NODEMAILER EMAIL DISPATCH]
  // -------------------------------------------------------------
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: email.trim().toLowerCase(),
      subject,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] OTP email sent successfully to ${email} (MessageId: ${info.messageId})`);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("[EmailService] Failed to send email via Nodemailer:", error.message);
    throw new Error(`Email delivery error: ${error.message}`);
  }

  /*
  // -------------------------------------------------------------
  // [PRESERVED: BREVO REST API IMPLEMENTATION (COMMENTED OUT)]
  // -------------------------------------------------------------
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || BREVO_CONFIG.DEFAULT_SENDER_EMAIL).trim();
  const senderName = (process.env.BREVO_SENDER_NAME || BREVO_CONFIG.DEFAULT_SENDER_NAME).trim();
  const apiKey = (process.env.BREVO_API_KEY || "").trim();

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [
      {
        email: email.trim().toLowerCase(),
        name: name.trim(),
      },
    ],
    subject,
    htmlContent,
  };

  const headers = getBrevoHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BREVO_CONFIG.TIMEOUT_MS);

  try {
    const response = await fetch(BREVO_CONFIG.API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseData = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        responseData?.message || `Brevo API returned status ${response.status}: ${response.statusText}`;
      throw new Error(`Email delivery service error: ${errorMessage}`);
    }

    return {
      success: true,
      messageId: responseData?.messageId,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
  */
};
