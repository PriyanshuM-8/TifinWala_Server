import {
  createComplaint,
  getCustomerComplaints,
} from "../Services/customerComplaintService.js";

/**
 * POST /api/customer/complaints
 */
export async function createComplaintHandler(req, res, next) {
  try {
    const { orderId, category, subject, description } = req.body;
    const complaint = await createComplaint({
      customerId: req.user._id,
      orderId,
      category,
      subject,
      description,
    });

    return res.status(201).json({
      success: true,
      message: "Complaint registered successfully. Support team will investigate shortly.",
      complaint,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/customer/complaints/my-complaints
 */
export async function getMyComplaintsHandler(req, res, next) {
  try {
    const complaints = await getCustomerComplaints(req.user._id);

    return res.status(200).json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    next(error);
  }
}
