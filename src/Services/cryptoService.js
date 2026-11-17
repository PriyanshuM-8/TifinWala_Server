import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a 32-byte key from environment or default secret.
 */
function getEncryptionKey() {
  const secret = process.env.PAYOUT_ENCRYPTION_KEY || process.env.JWT_SECRET || "default_gharkaswad_payout_key_32bytes!!";
  return crypto.createHash("sha256").update(String(secret)).digest();
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Output format: iv:authTag:encryptedHex
 */
export function encryptText(plainText) {
  if (!plainText) return null;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(String(plainText), "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 */
export function decryptText(cipherPayload) {
  if (!cipherPayload || typeof cipherPayload !== "string") return null;
  const parts = cipherPayload.split(":");
  if (parts.length !== 3) return null;
  const [ivHex, authTagHex, encryptedHex] = parts;
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Mask account number: e.g. "1234567890" -> "••••••7890"
 */
export function maskAccountNumber(accountNumber) {
  if (!accountNumber) return "";
  const str = String(accountNumber).trim();
  if (str.length <= 4) return "••••" + str;
  const visible = str.slice(-4);
  return "•".repeat(Math.max(4, str.length - 4)) + visible;
}

/**
 * Mask IFSC code: e.g. "SBIN0001234" -> "SBIN••••234"
 */
export function maskIfscCode(ifscCode) {
  if (!ifscCode) return "";
  const str = String(ifscCode).trim().toUpperCase();
  if (str.length <= 4) return str;
  return str.slice(0, 4) + "••••" + str.slice(-3);
}
