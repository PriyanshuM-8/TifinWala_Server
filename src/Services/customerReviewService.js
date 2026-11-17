import Review from "../Models/Review.js";
import Order from "../Models/Order.js";

/**
 * Customer creates a review for a delivered order.
 * Strictly enforces order ownership, delivered status, and one review per order.
 */
export async function createReview({ customerId, orderId, rating, title, comment }) {
  if (!orderId) {
    const error = new Error("orderId is required to submit a review.");
    error.statusCode = 400;
    throw error;
  }

  const numericRating = Number(rating);
  if (!numericRating || numericRating < 1 || numericRating > 5) {
    const error = new Error("Rating must be a valid number between 1 and 5.");
    error.statusCode = 400;
    throw error;
  }

  if (!comment || typeof comment !== "string" || comment.trim().length < 3) {
    const error = new Error("Review comment must be at least 3 characters long.");
    error.statusCode = 400;
    throw error;
  }

  const order = await Order.findById(orderId);
  if (!order) {
    const error = new Error("Order not found.");
    error.statusCode = 404;
    throw error;
  }

  // 1. Validate ownership
  if (order.customerId.toString() !== customerId.toString()) {
    const error = new Error("You can only review orders placed by your own account.");
    error.statusCode = 403;
    throw error;
  }

  // 2. Validate delivered status
  if (order.orderStatus !== "delivered") {
    const error = new Error(
      `Only delivered orders can be reviewed. Current order status is '${order.orderStatus}'.`
    );
    error.statusCode = 400;
    throw error;
  }

  // 3. Prevent duplicate reviews for the same order
  const existingReview = await Review.findOne({ orderId: order._id });
  if (existingReview) {
    const error = new Error("You have already reviewed this delivered order.");
    error.statusCode = 409;
    throw error;
  }

  const review = new Review({
    customerId,
    chefId: order.chefId,
    orderId: order._id,
    rating: numericRating,
    title: title ? String(title).trim() : "",
    comment: comment.trim(),
    moderationStatus: "approved", // Automatically visible unless flagged or hidden
  });

  await review.save();

  return review;
}

/**
 * Returns all reviews authored by a specific customer.
 */
export async function getCustomerReviews(customerId) {
  const reviews = await Review.find({ customerId })
    .sort({ createdAt: -1 })
    .populate("chefId", "name email")
    .populate("orderId", "orderNumber totalAmount deliveredAt items")
    .lean();

  return reviews;
}

/**
 * Returns publicly approved reviews for a specific chef.
 */
export async function getPublicChefReviews(chefId, { page = 1, limit = 10 }) {
  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (numericPage - 1) * numericLimit;

  const query = {
    chefId,
    moderationStatus: "approved",
  };

  const [totalRecords, reviews] = await Promise.all([
    Review.countDocuments(query),
    Review.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("customerId", "name")
      .select("-moderationReason -moderatedBy -moderatedAt")
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
