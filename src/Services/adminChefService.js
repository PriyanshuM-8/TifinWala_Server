import mongoose from "mongoose";
import ChefProfile from "../Models/ChefProfile.js";
import User from "../Models/User.js";
import Food from "../Models/Food.js";
import Order from "../Models/Order.js";
import ChefEarning from "../Models/ChefEarning.js";
import ChefWallet from "../Models/ChefWallet.js";
import ChefCommissionWallet from "../Models/ChefCommissionWallet.js";
import ChefCommissionTransaction from "../Models/ChefCommissionTransaction.js";
import { sendChefStatusEmail } from "./emailService.js";
import { logAdminAction } from "./auditLogService.js";
import { resolveCoordinatesForCity } from "../utils/geoUtils.js";

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
export const getAllChefs = async (options = {}) => {
  const {
    status,
    approvalStatus,
    search,
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = options;
  const query = {};

  const targetStatus = status || approvalStatus;
  // 1. Status Filter
  if (targetStatus && targetStatus !== "all") {
    const validStatuses = ["pending", "approved", "rejected"];
    if (validStatuses.includes(targetStatus.toLowerCase())) {
      query.approvalStatus = targetStatus.toLowerCase();
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

  // Ensure chef has valid GeoJSON coordinates for discovery
  if (
    !profile.location ||
    !Array.isArray(profile.location.coordinates) ||
    profile.location.coordinates.length !== 2
  ) {
    const coords = resolveCoordinatesForCity(profile.city, profile.kitchenAddress);
    profile.location = {
      type: "Point",
      coordinates: coords,
    };
  }

  // Ensure service radius is at least 15 km
  if (!profile.serviceRadiusKm || profile.serviceRadiusKm < 5) {
    profile.serviceRadiusKm = 15;
  }

  await profile.save();

  // Ensure linked User has role: 'chef' and isActive: true
  if (profile.userId) {
    const chefUserId = profile.userId._id || profile.userId;
    const chefUserDoc = await User.findById(chefUserId);
    if (chefUserDoc) {
      chefUserDoc.isActive = true;
      if (chefUserDoc.role !== "chef") chefUserDoc.role = "chef";
      await chefUserDoc.save();
    }
  }

  // Populate reviewer details
  await profile.populate("reviewedBy", "name email role");

  // Record audit log
  await logAdminAction({
    adminId: adminUserId,
    actionType: "chef_approval",
    targetEntityType: "ChefProfile",
    targetEntityId: profile._id,
    previousState: { approvalStatus: "pending" },
    newState: { approvalStatus: "approved" },
    reason: `Chef '${profile.kitchenName}' application approved.`,
  });

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

  // Record audit log
  await logAdminAction({
    adminId: adminUserId,
    actionType: "chef_rejection",
    targetEntityType: "ChefProfile",
    targetEntityId: profile._id,
    previousState: { approvalStatus: "pending" },
    newState: { approvalStatus: "rejected", rejectionReason: profile.rejectionReason },
    reason: `Chef '${profile.kitchenName}' application rejected: ${profile.rejectionReason}`,
  });

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

/**
 * ADMIN: Suspend or reactivate a chef account.
 * Updates User.isActive, hides dishes if suspended, and preserves all wallet balances.
 */
export const updateChefStatus = async (identifier, adminUserId, { isActive, reason }) => {
  if (isActive === undefined) {
    const error = new Error("isActive boolean is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    const error = new Error("Reason for chef status change must be at least 3 characters.");
    error.statusCode = 400;
    throw error;
  }

  const profile = await getChefById(identifier);
  const chefUserId = profile.userId._id || profile.userId;

  const chefUser = await User.findById(chefUserId);
  if (!chefUser) {
    const error = new Error("Associated chef user account not found.");
    error.statusCode = 404;
    throw error;
  }

  const previousState = {
    isActive: chefUser.isActive,
  };

  chefUser.isActive = Boolean(isActive);
  await chefUser.save();

  const newState = {
    isActive: chefUser.isActive,
  };

  // Record audit log
  await logAdminAction({
    adminId: adminUserId,
    actionType: "chef_status_change",
    targetEntityType: "ChefProfile",
    targetEntityId: profile._id,
    previousState,
    newState,
    reason: `Chef '${profile.kitchenName}' account ${chefUser.isActive ? "reactivated" : "suspended"}. Reason: ${reason.trim()}`,
  });

  return {
    profile,
    chefUser,
    message: `Chef '${profile.kitchenName}' has been ${chefUser.isActive ? "reactivated" : "suspended"} successfully.`,
  };
};

/**
 * ADMIN: Returns paginated orders for a chef.
 */
export const getChefOrders = async (identifier, { page = 1, limit = 10, orderStatus }) => {
  const profile = await getChefById(identifier);
  const chefUserId = profile.userId._id || profile.userId;

  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (numericPage - 1) * numericLimit;

  const query = { chefId: chefUserId };
  if (orderStatus) query.orderStatus = orderStatus;

  const [totalRecords, orders] = await Promise.all([
    Order.countDocuments(query),
    Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("customerId", "name email phone")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    orders,
  };
};

/**
 * ADMIN: Returns all foods created by a chef.
 */
export const getChefFoods = async (identifier, { page = 1, limit = 20 }) => {
  const profile = await getChefById(identifier);
  const chefUserId = profile.userId._id || profile.userId;

  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = { chefId: chefUserId };

  const [totalRecords, foods] = await Promise.all([
    Food.countDocuments(query),
    Food.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("categoryId", "name description")
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    foods,
  };
};

/**
 * ADMIN: Returns paginated earnings records for a chef.
 */
export const getChefEarnings = async (identifier, { page = 1, limit = 20, status }) => {
  const profile = await getChefById(identifier);
  const chefUserId = profile.userId._id || profile.userId;

  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = { chefId: chefUserId };
  if (status) query.status = status;

  const [totalRecords, earnings] = await Promise.all([
    ChefEarning.countDocuments(query),
    ChefEarning.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    earnings,
  };
};

/**
 * ADMIN: Returns chef earnings wallet and commission wallet overview.
 */
export const getChefWalletsOverview = async (identifier) => {
  const profile = await getChefById(identifier);
  const chefUserId = profile.userId._id || profile.userId;

  const [earningsWallet, commissionWallet] = await Promise.all([
    ChefWallet.findOne({ chefId: chefUserId }).lean(),
    ChefCommissionWallet.findOne({ chefId: chefUserId }).lean(),
  ]);

  return {
    chefId: chefUserId,
    kitchenName: profile.kitchenName,
    earningsWallet: earningsWallet || {
      availableBalancePaise: 0,
      pendingBalancePaise: 0,
      settledBalancePaise: 0,
      totalEarnedPaise: 0,
      reservedWithdrawalBalancePaise: 0,
    },
    commissionWallet: commissionWallet || {
      balancePaise: 0,
      availableBalancePaise: 0,
      reservedBalancePaise: 0,
      totalCommissionPaidPaise: 0,
    },
  };
};

/**
 * ADMIN: Returns commission transactions for a chef.
 */
export const getChefCommissionTransactions = async (identifier, { page = 1, limit = 20 }) => {
  const profile = await getChefById(identifier);
  const chefUserId = profile.userId._id || profile.userId;

  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const query = { chefId: chefUserId };

  const [totalRecords, transactions] = await Promise.all([
    ChefCommissionTransaction.countDocuments(query),
    ChefCommissionTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .lean(),
  ]);

  return {
    totalRecords,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(totalRecords / numericLimit) || 1,
    transactions,
  };
};
