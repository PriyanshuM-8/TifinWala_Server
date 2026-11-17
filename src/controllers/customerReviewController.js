import {
  createReview,
  getCustomerReviews,
  getPublicChefReviews,
} from "../Services/customerReviewService.js";

/**
 * POST /api/customer/reviews
 */
export async function createReviewHandler(req, res, next) {
  try {
    const { orderId, rating, title, comment } = req.body;
    const review = await createReview({
      customerId: req.user._id,
      orderId,
      rating,
      title,
      comment,
    });

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully.",
      review,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/customer/reviews/my-reviews
 */
export async function getMyReviewsHandler(req, res, next) {
  try {
    const reviews = await getCustomerReviews(req.user._id);

    return res.status(200).json({
      success: true,
      count: reviews.length,
      reviews,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/chefs/:chefId/reviews (Public)
 */
export async function getPublicChefReviewsHandler(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await getPublicChefReviews(req.params.chefId || req.params.id, { page, limit });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}
