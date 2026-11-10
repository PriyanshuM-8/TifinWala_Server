import mongoose from "mongoose";
import ChefProfile from "../Models/ChefProfile.js";
import User from "../Models/User.js";
import { sendChefStatusEmail } from "./emailService.js";

/**
 * Lists all chef profiles with filtering, pagination, and multi-field search.
 * @param {object} options
 * @param {string} [options.status] - 'pending', 'approved', 'rejected', or 'all'
 * @param {string} [options.search] - Search by kitchen name, owner, city, or user email
 * @param {number} [options.page=1]
 * @param {number} [options.limit=10]
 * @param {string} [options.sortBy='createdAt']
 * @param {string} [options.sortOrder='desc']
 */
export const getAllChefs = async ({
  status,
  search,
  page = 1,
  limit = 10,
  sortBy = "createdAt",
  sortOrder = "desc",
}) => {
  const query = {};

  // 1. Status Filter
  if (status && status !== "all") {
    const validStatuses = ["pending", "approved", "rejected"];
    if (validStatuses.includes(status.toLowerCase())) {
      query.approvalStatus = status.toLowerCase();
    }
  }

  // 2. Search by kitchenName, ownerName, city, or linked User email
  if (search && search.trim() !== "") {
    const searchRegex = new RegExp(search.trim(), "i");

    // Check if search matches any user emails
    const matchingUsers = await User.find({
      email: searchRegex,
    }).select("_id");

    const matchedUserIds = matchingUsers.map((u) => u._id);

    query.$or = [
      { kitchenName: searchRegex },
      { ownerName: searchRegex },
      { city: searchRegex },
      ...(matchedUserIds.length > 0 ? [{ userId: { $in: matchedUserIds } }] : []),
    ];
  }

  // 3. Pagination Setup
  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNumber - 1) * pageSize;

  // 4. Sorting Setup
  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  // 5. Query execution
  const total = await ChefProfile.countDocuments(query);
  const chefs = await ChefProfile.find(query)
    .populate("userId", "name email phone emailVerified isActive createdAt")
    .populate("reviewedBy", "name email role")
    .sort(sort)
    .skip(skip)
    .limit(pageSize);

  return {
    chefs,
    pagination: {
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
      hasMore: pageNumber * pageSize < total,
    },
  };
};

/**
 * Retrieves full details of a specific chef by ChefProfile ID or linked User ID.
 * @param {string} identifier
 */
export const getChefById = async (identifier) => {
  let profile = null;

  if (mongoose.Types.ObjectId.isValid(identifier)) {
    profile = await ChefProfile.findOne({
      $or: [{ _id: identifier }, { userId: identifier }],
    })
      .populate("userId", "name email phone emailVerified isActive createdAt")
      .populate("reviewedBy", "name email role");
  }

  if (!profile) {
    const error = new Error("Chef profile not found with the specified identifier.");
    error.statusCode = 404;
    throw error;
  }

  return profile;
};

/**
 * Approves a chef application.
 * @param {string} identifier - ChefProfile ID
 * @param {string|mongoose.Types.ObjectId} adminUserId
 */
export const approveChefApplication = async (identifier, adminUserId) => {
  const profile = await getChefById(identifier);

  // Policy: Prevent approving an already approved chef
  if (profile.approvalStatus === "approved") {
    const error = new Error(
      `Action blocked: Kitchen '${profile.kitchenName}' is already approved. Resubmission is not required.`
    );
    error.statusCode = 400;
    throw error;
  }

  // Update status and audit fields
  profile.approvalStatus = "approved";
  profile.reviewedBy = adminUserId;
  profile.reviewedAt = new Date();
  profile.rejectionReason = null;

  await profile.save();

  // Populate reviewer details
  await profile.populate("reviewedBy", "name email role");

  // Dispatch asynchronous status email to chef
  const chefUser = profile.userId;
  if (chefUser && chefUser.email) {
    sendChefStatusEmail({
      email: chefUser.email,
      name: chefUser.name || profile.ownerName,
      kitchenName: profile.kitchenName,
      status: "approved",
    }).catch((err) => {
      console.error("[AdminChefService] Background notification error:", err.message);
    });
  }

  return {
    profile,
    message: `Chef application for '${profile.kitchenName}' has been approved successfully. Kitchen operations are now active.`,
  };
};

/**
 * Rejects a chef application with an explicit reason.
 * @param {string} identifier - ChefProfile ID
 * @param {string|mongoose.Types.ObjectId} adminUserId
 * @param {string} rejectionReason
 */
export const rejectChefApplication = async (identifier, adminUserId, rejectionReason) => {
  if (!rejectionReason || typeof rejectionReason !== "string" || rejectionReason.trim().length < 5) {
    const error = new Error(
      "Rejection reason is mandatory and must be at least 5 characters long."
    );
    error.statusCode = 400;
    throw error;
  }

  const profile = await getChefById(identifier);

  // Policy: Prevent rejecting an already rejected chef without profile resubmission
  if (profile.approvalStatus === "rejected") {
    const error = new Error(
      `Action blocked: Kitchen '${profile.kitchenName}' is already in rejected status. Awaiting chef resubmission.`
    );
    error.statusCode = 400;
    throw error;
  }

  // Update status and audit fields
  profile.approvalStatus = "rejected";
  profile.rejectionReason = rejectionReason.trim();
  profile.reviewedBy = adminUserId;
  profile.reviewedAt = new Date();

  await profile.save();

  await profile.populate("reviewedBy", "name email role");

  // Dispatch asynchronous status email to chef
  const chefUser = profile.userId;
  if (chefUser && chefUser.email) {
    sendChefStatusEmail({
      email: chefUser.email,
      name: chefUser.name || profile.ownerName,
      kitchenName: profile.kitchenName,
      status: "rejected",
      rejectionReason: profile.rejectionReason,
    }).catch((err) => {
      console.error("[AdminChefService] Background notification error:", err.message);
    });
  }

  return {
    profile,
    message: `Chef application for '${profile.kitchenName}' has been rejected. Notification dispatched with feedback.`,
  };
};
