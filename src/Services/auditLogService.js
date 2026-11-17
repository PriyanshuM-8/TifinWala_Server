import fs from "node:fs";
import path from "node:path";
import AuditLog from "../Models/AuditLog.js";

const SENSITIVE_KEYS = new Set([
  "password",
  "otp",
  "otphash",
  "token",
  "secret",
  "refreshtoken",
  "encryptedaccountnumber",
  "encryptedifsccode",
  "accountnumber",
  "ifsccode",
  "razorpaysignature",
  "keyid",
  "keysecret",
  "creditcard",
  "cvv",
]);

/**
 * Deeply and recursively sanitizes data objects to ensure zero leakage of
 * passwords, tokens, hashes, or raw banking/payment secrets into audit logs.
 */
export function sanitizeAuditData(input) {
  if (input === null || input === undefined) {
    return input;
  }

  // Handle Mongoose documents or objects with toObject/toJSON
  let data = input;
  if (typeof data.toObject === "function") {
    data = data.toObject();
  } else if (typeof data.toJSON === "function") {
    data = data.toJSON();
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item));
  }

  if (typeof data === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = sanitizeAuditData(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Logs an administrative action in the append-only AuditLog collection.
 * Transaction-aware with persistent fallback disk logging on failure.
 */
export async function logAdminAction(
  {
    adminId,
    actionType,
    targetEntityType,
    targetEntityId,
    previousState = null,
    newState = null,
    reason,
    ipAddress = null,
    userAgent = null,
    metadata = {},
  },
  session = null
) {
  try {
    const cleanPrev = sanitizeAuditData(previousState);
    const cleanNew = sanitizeAuditData(newState);
    const cleanMeta = sanitizeAuditData(metadata);

    const logEntry = new AuditLog({
      adminId,
      actionType,
      targetEntityType,
      targetEntityId: String(targetEntityId),
      previousState: cleanPrev,
      newState: cleanNew,
      reason: String(reason || "Administrative operation").trim(),
      ipAddress,
      userAgent,
      metadata: cleanMeta || {},
    });

    if (session) {
      await logEntry.save({ session });
    } else {
      await logEntry.save();
    }

    return logEntry;
  } catch (err) {
    // Persistent disk fallback to guarantee zero silent loss
    const fallbackPath = path.resolve(process.cwd(), "audit-fallback.log");
    const fallbackRecord = JSON.stringify({
      timestamp: new Date().toISOString(),
      adminId,
      actionType,
      targetEntityType,
      targetEntityId,
      reason,
      error: err.message,
    });

    try {
      fs.appendFileSync(fallbackPath, fallbackRecord + "\n", "utf8");
    } catch (fsErr) {
      console.error("[AuditLogService] Critical: Failed to write to fallback audit log:", fsErr.message);
    }

    console.error("[AuditLogService] Failed to persist audit log to MongoDB:", err.message);

    // If part of an active transaction session, rethrow to preserve atomic integrity
    if (session) {
      throw err;
    }
    return null;
  }
}

/**
 * Lists audit logs with multi-field filtering and pagination.
 */
export async function listAuditLogs({
  actionType,
  targetEntityType,
  targetEntityId,
  adminId,
  startDate,
  endDate,
  page = 1,
  limit = 20,
}) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = {};
  if (actionType) query.actionType = actionType;
  if (targetEntityType) query.targetEntityType = targetEntityType;
  if (targetEntityId) query.targetEntityId = String(targetEntityId);
  if (adminId) query.adminId = adminId;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const [totalRecords, auditLogs] = await Promise.all([
    AuditLog.countDocuments(query),
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("adminId", "name email role")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    auditLogs,
  };
}

/**
 * Fetches a single audit log by ID.
 */
export async function getAuditLogById(logId) {
  const log = await AuditLog.findById(logId)
    .populate("adminId", "name email role")
    .lean();

  if (!log) {
    const error = new Error("Audit log record not found.");
    error.statusCode = 404;
    throw error;
  }

  return log;
}
