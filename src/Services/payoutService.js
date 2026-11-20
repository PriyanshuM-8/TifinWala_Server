import crypto from "node:crypto";
import AdminWithdrawal from "../Models/AdminWithdrawal.js";
import AdminWallet from "../Models/AdminWallet.js";
import AdminWalletTransaction from "../Models/AdminWalletTransaction.js";
import PaymentWebhookEvent from "../Models/PaymentWebhookEvent.js";
import { logAdminAction } from "./auditLogService.js";
import { getDecryptedAdminBankDetails } from "./adminBankAccountService.js";

const generateTxNumber = (prefix = "ADM-TXN") =>
  `${prefix}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

/**
 * Initiates payout via RazorpayX or returns sandbox test payout when account is not yet live.
 */
export async function executePayout({ withdrawal, bankAccountId }) {
  const razorpayxAccount = process.env.RAZORPAYX_ACCOUNT_NUMBER || "";
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";

  // Check if real RazorpayX is activated
  const isLiveRazorpayX =
    Boolean(razorpayxAccount) &&
    !keyId.includes("test_default") &&
    !keyId.includes("demo");

  const bankDetails = await getDecryptedAdminBankDetails(bankAccountId);

  if (isLiveRazorpayX) {
    try {
      const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");

      // 1. Create / Get Contact
      const contactRes = await fetch("https://api.razorpay.com/v1/contacts", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: bankDetails.accountHolderName,
          type: "admin_withdrawal",
          reference_id: `adm_${withdrawal.adminId.toString().slice(-6)}`,
          notes: {
            adminId: withdrawal.adminId.toString(),
            withdrawalNumber: withdrawal.withdrawalNumber,
          },
        }),
      });
      const contactData = await contactRes.json();
      if (!contactRes.ok) {
        throw new Error(`RazorpayX contact creation failed: ${contactData.error?.description || "API error"}`);
      }

      // 2. Create Fund Account
      const fundRes = await fetch("https://api.razorpay.com/v1/fund_accounts", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contact_id: contactData.id,
          account_type: "bank_account",
          bank_account: {
            name: bankDetails.accountHolderName,
            ifsc: bankDetails.ifscCode,
            account_number: bankDetails.accountNumber,
          },
        }),
      });
      const fundData = await fundRes.json();
      if (!fundRes.ok) {
        throw new Error(`RazorpayX fund account creation failed: ${fundData.error?.description || "API error"}`);
      }

      // 3. Initiate Payout
      const payoutRes = await fetch("https://api.razorpay.com/v1/payouts", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          "X-Payout-Idempotency": withdrawal.idempotencyKey,
        },
        body: JSON.stringify({
          account_number: razorpayxAccount,
          fund_account_id: fundData.id,
          amount: withdrawal.netTransferPaise,
          currency: "INR",
          mode: "IMPS",
          purpose: "payout",
          queue_if_low_balance: true,
          reference_id: withdrawal.withdrawalNumber,
          narration: "GharKaSwad Admin Withdrawal",
        }),
      });
      const payoutData = await payoutRes.json();
      if (!payoutRes.ok) {
        throw new Error(`RazorpayX payout request failed: ${payoutData.error?.description || "API error"}`);
      }

      return {
        success: true,
        providerPayoutId: payoutData.id,
        providerStatus: payoutData.status || "processing",
        utrNumber: payoutData.utr || null,
        payoutProvider: "razorpayx",
      };
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        throw err;
      }
      // In development fallback to test simulation
    }
  }

  // Simulated Test Payout Mode (Test Environment)
  const mockPayoutId = `pout_mock_${crypto.randomBytes(6).toString("hex")}`;
  const mockUtr = `UTR-GKS-${Date.now().toString().slice(-8)}`;

  return {
    success: true,
    providerPayoutId: mockPayoutId,
    providerStatus: "processing",
    utrNumber: mockUtr,
    payoutProvider: "mock_payout",
  };
}

/**
 * Verifies RazorpayX webhook signature.
 */
export function verifyPayoutWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAYX_WEBHOOK_SECRET || "rbaDqjct_9@dGv9";
  if (!rawBody || !signature || !secret) return false;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Handles incoming RazorpayX webhook events (processed, reversed, failed, rejected).
 */
export async function handlePayoutWebhookEvent(eventData) {
  const event = eventData.event;
  const payoutEntity = eventData.payload?.payout?.entity;

  if (!payoutEntity) {
    return { success: false, message: "Missing payout entity in webhook payload." };
  }

  const providerPayoutId = payoutEntity.id;
  const referenceId = payoutEntity.reference_id; // Maps to withdrawalNumber

  // Idempotency: check if this webhook event was already processed
  const eventId = eventData.id || `${event}_${providerPayoutId}_${payoutEntity.status}`;
  const existingEvent = await PaymentWebhookEvent.findOne({ eventId });
  if (existingEvent) {
    return { success: true, duplicate: true, message: "Webhook event already processed." };
  }

  const withdrawal = await AdminWithdrawal.findOne({
    $or: [
      { providerPayoutId },
      ...(referenceId ? [{ withdrawalNumber: referenceId }] : []),
    ],
  });

  if (!withdrawal) {
    return { success: false, message: `Withdrawal not found for payout ${providerPayoutId}` };
  }

  // Record webhook audit log entry
  await PaymentWebhookEvent.create({
    eventId,
    eventType: event,
    provider: "razorpayx",
    orderId: null,
    paymentId: null,
    payload: eventData,
    processed: true,
  });

  const wallet = await AdminWallet.findOne({ walletType: "platform_commission" });
  if (!wallet) {
    throw new Error("AdminWallet not found for settlement.");
  }

  if (event === "payout.processed" || event === "payout.updated") {
    // Idempotency check: if already successful, do not double-settle
    if (withdrawal.status === "successful") {
      return { success: true, message: "Withdrawal was already settled." };
    }

    withdrawal.status = "successful";
    withdrawal.providerStatus = payoutEntity.status || "processed";
    withdrawal.utrNumber = payoutEntity.utr || withdrawal.utrNumber || `UTR-${Date.now().toString().slice(-8)}`;
    withdrawal.completedAt = new Date();
    await withdrawal.save();

    // Settle in AdminWallet: release from reservedWithdrawalPaise and add to totalWithdrawnPaise
    wallet.reservedWithdrawalPaise = Math.max(0, wallet.reservedWithdrawalPaise - withdrawal.amountPaise);
    wallet.totalWithdrawnPaise += withdrawal.amountPaise;
    await wallet.save();

    // Record ledger transaction
    await AdminWalletTransaction.create({
      transactionNumber: generateTxNumber("CC-WTH-CAP"),
      adminWalletId: wallet._id,
      adminUserId: withdrawal.adminId,
      transactionType: "admin_withdrawal_capture",
      amountPaise: withdrawal.amountPaise,
      balanceAfterPaise: wallet.availableBalancePaise,
      adminWithdrawalId: withdrawal._id,
      description: `Admin payout settled successfully: #${withdrawal.withdrawalNumber}. UTR: ${withdrawal.utrNumber}`,
      idempotencyKey: `cap_${withdrawal._id}_${Date.now()}`,
    });

    await logAdminAction({
      adminId: withdrawal.adminId,
      actionType: "admin_withdrawal_settled",
      targetEntityType: "AdminWithdrawal",
      targetEntityId: withdrawal._id,
      previousState: { status: "processing" },
      newState: { status: "successful", utrNumber: withdrawal.utrNumber },
      reason: `Payout settled for withdrawal #${withdrawal.withdrawalNumber}. UTR: ${withdrawal.utrNumber}`,
    });

    return { success: true, status: "successful", withdrawal };
  } else if (
    event === "payout.failed" ||
    event === "payout.reversed" ||
    event === "payout.rejected"
  ) {
    if (["failed", "reversed", "cancelled"].includes(withdrawal.status)) {
      return { success: true, message: "Withdrawal was already closed." };
    }

    withdrawal.status = event === "payout.reversed" ? "reversed" : "failed";
    withdrawal.providerStatus = payoutEntity.status || "failed";
    withdrawal.failureReason = payoutEntity.failure_reason || "Payout failed at provider.";
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    // Restore reserved funds: release from reservedWithdrawalPaise
    wallet.reservedWithdrawalPaise = Math.max(0, wallet.reservedWithdrawalPaise - withdrawal.amountPaise);
    await wallet.save();

    // Record ledger transaction for released reservation
    await AdminWalletTransaction.create({
      transactionNumber: generateTxNumber("CC-WTH-REL"),
      adminWalletId: wallet._id,
      adminUserId: withdrawal.adminId,
      transactionType: "admin_withdrawal_release",
      amountPaise: withdrawal.amountPaise,
      balanceAfterPaise: wallet.availableBalancePaise,
      adminWithdrawalId: withdrawal._id,
      description: `Admin payout failed: reservation released back for #${withdrawal.withdrawalNumber}. Reason: ${withdrawal.failureReason}`,
      idempotencyKey: `rel_${withdrawal._id}_${Date.now()}`,
    });

    await logAdminAction({
      adminId: withdrawal.adminId,
      actionType: "admin_withdrawal_failed",
      targetEntityType: "AdminWithdrawal",
      targetEntityId: withdrawal._id,
      previousState: { status: "processing" },
      newState: { status: withdrawal.status, failureReason: withdrawal.failureReason },
      reason: `Payout failed for withdrawal #${withdrawal.withdrawalNumber}. Funds unlocked.`,
    });

    return { success: true, status: withdrawal.status, withdrawal };
  }

  return { success: true, ignored: true };
}
