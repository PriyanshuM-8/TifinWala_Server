import {
  listAllReviews,
  moderateReview,
  listAllComplaints,
  getComplaintDetails,
  resolveComplaint,
} from "../Services/adminReviewComplaintService.js";

/**
 * GET /api/admin/reviews
 */
export async function listReviewsHandler(req, res, next) {
  try {
    const { rating, moderationStatus, chefId, customerId, page, limit } = req.query;
    const result = await listAllReviews({
      rating,
      moderationStatus,
      chefId,
      customerId,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/reviews/:reviewId/moderation
 */
export async function moderateReviewHandler(req, res, next) {
  try {
    const { moderationStatus, reason } = req.body;
    const review = await moderateReview(req.params.reviewId, req.user._id, {
      moderationStatus,
      reason,
    });

    return res.status(200).json({
      success: true,
      message: `Review moderation status updated to '${moderationStatus}'.`,
      review,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/complaints
 */
export async function listComplaintsHandler(req, res, next) {
  try {
    const { status, category, chefId, customerId, page, limit } = req.query;
    const result = await listAllComplaints({
      status,
      category,
      chefId,
      customerId,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/complaints/:complaintId
 */
export async function getComplaintDetailsHandler(req, res, next) {
  try {
    const complaint = await getComplaintDetails(req.params.complaintId);

    return res.status(200).json({
      success: true,
      complaint,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/complaints/:complaintId/status
 */
export async function resolveComplaintHandler(req, res, next) {
  try {
    const { status, resolutionNotes, reason } = req.body;
    const complaint = await resolveComplaint(req.params.complaintId, req.user._id, {
      status,
      resolutionNotes,
      reason,
    });

    return res.status(200).json({
      success: true,
      message: `Complaint status updated to '${status}'.`,
      complaint,
    });
  } catch (error) {
    next(error);
  }
}
