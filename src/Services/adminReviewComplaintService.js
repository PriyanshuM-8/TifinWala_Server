import Review from "../Models/Review.js";
import Complaint from "../Models/Complaint.js";
import { logAdminAction } from "./auditLogService.js";

/**
 * ADMIN: Lists all reviews with filtering and pagination.
 */
export async function listAllReviews({
  rating,
  moderationStatus,
  chefId,
  customerId,
  page = 1,
  limit = 20,
}) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = {};
  if (rating) query.rating = Number(rating);
  if (moderationStatus) query.moderationStatus = moderationStatus;
  if (chefId) query.chefId = chefId;
  if (customerId) query.customerId = customerId;

  const [totalRecords, reviews] = await Promise.all([
    Review.countDocuments(query),
    Review.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("customerId", "name email phone")
      .populate("chefId", "name email")
      .populate("orderId", "orderNumber totalAmount orderStatus")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    reviews,
  };
}

/**
 * ADMIN: Moderate review status (approved, flagged, hidden).
 */
export async function moderateReview(
  reviewId,
  adminUserId,
  { moderationStatus, reason }
) {
  if (!["approved", "flagged", "hidden"].includes(moderationStatus)) {
    const error = new Error(
      `Invalid moderationStatus '${moderationStatus}'. Allowed: approved, flagged, hidden.`
    );
    error.statusCode = 400;
    throw error;
  }

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    const error = new Error("Moderation reason must be at least 3 characters long.");
    error.statusCode = 400;
    throw error;
  }

  const review = await Review.findById(reviewId);
  if (!review) {
    const error = new Error("Review not found.");
    error.statusCode = 404;
    throw error;
  }

  const previousState = {
    moderationStatus: review.moderationStatus,
    moderationReason: review.moderationReason,
    moderatedBy: review.moderatedBy,
  };

  review.moderationStatus = moderationStatus;
  review.moderationReason = reason.trim();
  review.moderatedBy = adminUserId;
  review.moderatedAt = new Date();
  await review.save();

  const newState = {
    moderationStatus: review.moderationStatus,
    moderationReason: review.moderationReason,
    moderatedBy: review.moderatedBy,
  };

  // Record audit log
  await logAdminAction({
    adminId: adminUserId,
    actionType: "review_moderation",
    targetEntityType: "Review",
    targetEntityId: review._id,
    previousState,
    newState,
    reason: `Review status changed from ${previousState.moderationStatus} to ${moderationStatus}: ${reason.trim()}`,
  });

  return review;
}

/**
 * ADMIN: Lists complaints with filtering and pagination.
 */
export async function listAllComplaints({
  status,
  category,
  chefId,
  customerId,
  page = 1,
  limit = 20,
}) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = {};
  if (status) query.status = status;
  if (category) query.category = category;
  if (chefId) query.chefId = chefId;
  if (customerId) query.customerId = customerId;

  const [totalRecords, complaints] = await Promise.all([
    Complaint.countDocuments(query),
    Complaint.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("customerId", "name email phone")
      .populate("chefId", "name email")
      .populate("orderId", "orderNumber totalAmount orderStatus")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    complaints,
  };
}

/**
 * ADMIN: Fetch detailed complaint.
 */
export async function getComplaintDetails(complaintId) {
  const complaint = await Complaint.findById(complaintId)
    .populate("customerId", "name email phone")
    .populate("chefId", "name email")
    .populate("orderId")
    .populate("resolvedBy", "name email")
    .lean();

  if (!complaint) {
    const error = new Error("Complaint not found.");
    error.statusCode = 404;
    throw error;
  }

  return complaint;
}

/**
 * ADMIN: Resolve or update complaint status.
 */
export async function resolveComplaint(
  complaintId,
  adminUserId,
  { status, resolutionNotes, reason }
) {
  if (!["under_investigation", "resolved", "dismissed"].includes(status)) {
    const error = new Error(
      `Invalid complaint status '${status}'. Allowed: under_investigation, resolved, dismissed.`
    );
    error.statusCode = 400;
    throw error;
  }

  if (!resolutionNotes || typeof resolutionNotes !== "string" || resolutionNotes.trim().length < 3) {
    const error = new Error("Resolution notes must be at least 3 characters long.");
    error.statusCode = 400;
    throw error;
  }

  const complaint = await Complaint.findById(complaintId);
  if (!complaint) {
    const error = new Error("Complaint not found.");
    error.statusCode = 404;
    throw error;
  }

  const previousState = {
    status: complaint.status,
    resolutionNotes: complaint.resolutionNotes,
    resolvedBy: complaint.resolvedBy,
  };

  complaint.status = status;
  complaint.resolutionNotes = resolutionNotes.trim();
  complaint.resolvedBy = adminUserId;
  complaint.resolvedAt = new Date();
  await complaint.save();

  const newState = {
    status: complaint.status,
    resolutionNotes: complaint.resolutionNotes,
    resolvedBy: complaint.resolvedBy,
  };

  // Record audit log
  await logAdminAction({
    adminId: adminUserId,
    actionType: "complaint_resolution",
    targetEntityType: "Complaint",
    targetEntityId: complaint._id,
    previousState,
    newState,
    reason: String(reason || `Complaint status updated to ${status}: ${resolutionNotes.trim()}`).trim(),
  });

  return complaint;
}
