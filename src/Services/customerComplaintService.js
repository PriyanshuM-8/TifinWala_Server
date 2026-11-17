import Complaint from "../Models/Complaint.js";
import Order from "../Models/Order.js";

const generateComplaintNumber = () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `CMP-${dateStr}-${randomSuffix}`;
};

/**
 * Customer creates a complaint.
 * Supports order-linked complaints and general application complaints.
 */
export async function createComplaint({
  customerId,
  orderId = null,
  category,
  subject,
  description,
}) {
  if (!category) {
    const error = new Error("Complaint category is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!subject || typeof subject !== "string" || subject.trim().length < 3) {
    const error = new Error("Complaint subject must be at least 3 characters long.");
    error.statusCode = 400;
    throw error;
  }

  if (!description || typeof description !== "string" || description.trim().length < 10) {
    const error = new Error("Complaint description must be at least 10 characters long.");
    error.statusCode = 400;
    throw error;
  }

  let resolvedChefId = null;
  let resolvedOrderId = null;

  if (orderId) {
    const order = await Order.findById(orderId);
    if (!order) {
      const error = new Error("Order referenced in complaint was not found.");
      error.statusCode = 404;
      throw error;
    }

    if (order.customerId.toString() !== customerId.toString()) {
      const error = new Error("You can only file complaints for orders placed by your own account.");
      error.statusCode = 403;
      throw error;
    }

    // Check for open/duplicate complaints on the same order
    const existingOpen = await Complaint.findOne({
      orderId: order._id,
      customerId,
      status: { $in: ["open", "under_investigation"] },
    });

    if (existingOpen) {
      const error = new Error(
        `There is already an active complaint (${existingOpen.complaintNumber}) under review for this order.`
      );
      error.statusCode = 409;
      throw error;
    }

    resolvedChefId = order.chefId;
    resolvedOrderId = order._id;
  }

  const complaint = new Complaint({
    complaintNumber: generateComplaintNumber(),
    customerId,
    orderId: resolvedOrderId,
    chefId: resolvedChefId,
    category,
    subject: subject.trim(),
    description: description.trim(),
    status: "open",
  });

  await complaint.save();

  return complaint;
}

/**
 * Returns all complaints filed by a specific customer.
 */
export async function getCustomerComplaints(customerId) {
  const complaints = await Complaint.find({ customerId })
    .sort({ createdAt: -1 })
    .populate("chefId", "name email")
    .populate("orderId", "orderNumber totalAmount orderStatus")
    .lean();

  return complaints;
}
