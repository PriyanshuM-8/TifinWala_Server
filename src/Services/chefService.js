import ChefProfile from "../Models/ChefProfile.js";

// Fields that require safety/identity re-verification if changed by an already approved chef
const CRITICAL_VERIFICATION_FIELDS = [
  "kitchenName",
  "ownerName",
  "kitchenAddress",
  "city",
  "foodSafetyDetails",
];

// All allowed editable fields
const ALLOWED_UPDATE_FIELDS = [
  "kitchenName",
  "ownerName",
  "kitchenAddress",
  "city",
  "description",
  "foodCategories",
  "cuisineTypes",
  "foodSafetyDetails",
  "kitchenImages",
];

/**
 * Retrieves the profile of the authenticated chef.
 * @param {string|mongoose.Types.ObjectId} userId
 */
export const getChefProfile = async (userId) => {
  const profile = await ChefProfile.findOne({ userId }).populate(
    "userId",
    "name email phone emailVerified isActive createdAt"
  );

  if (!profile) {
    const error = new Error("Chef profile not found for this account.");
    error.statusCode = 404;
    throw error;
  }

  return profile;
};

/**
 * Updates allowed chef profile fields and enforces re-verification policy.
 * @param {string|mongoose.Types.ObjectId} userId
 * @param {object} updateData
 */
export const updateChefProfile = async (userId, updateData) => {
  const profile = await ChefProfile.findOne({ userId });

  if (!profile) {
    const error = new Error("Chef profile not found for this account.");
    error.statusCode = 404;
    throw error;
  }

  // Prevent direct tampering with administrative audit fields
  const forbiddenFields = ["approvalStatus", "reviewedBy", "reviewedAt", "userId", "_id"];
  const attemptedForbidden = forbiddenFields.filter((f) => updateData[f] !== undefined);

  if (attemptedForbidden.length > 0) {
    const error = new Error(
      `Permission denied: Chefs cannot modify administrative fields: [${attemptedForbidden.join(
        ", "
      )}].`
    );
    error.statusCode = 403;
    throw error;
  }

  let statusChangedToPending = false;
  let reVerificationTriggered = false;

  // Check if any critical verification field has actually changed
  const hasCriticalChange = CRITICAL_VERIFICATION_FIELDS.some((field) => {
    if (updateData[field] === undefined) return false;
    const currentVal = profile[field] || "";
    const newVal = typeof updateData[field] === "string" ? updateData[field].trim() : updateData[field];
    return currentVal.toString() !== newVal.toString();
  });

  // Re-verification Policy:
  // 1. If chef was 'approved' and changed critical verification info -> reset to 'pending'
  if (profile.approvalStatus === "approved" && hasCriticalChange) {
    profile.approvalStatus = "pending";
    profile.reviewedBy = null;
    profile.reviewedAt = null;
    profile.rejectionReason = null;
    reVerificationTriggered = true;
    statusChangedToPending = true;
  }

  // 2. If chef was 'rejected' and submits updates -> reset to 'pending' for resubmission
  if (profile.approvalStatus === "rejected") {
    profile.approvalStatus = "pending";
    profile.rejectionReason = null;
    profile.reviewedBy = null;
    profile.reviewedAt = null;
    statusChangedToPending = true;
  }

  // Apply allowed field updates with sanitization
  ALLOWED_UPDATE_FIELDS.forEach((field) => {
    if (updateData[field] !== undefined) {
      if (typeof updateData[field] === "string") {
        profile[field] = updateData[field].trim();
      } else if (Array.isArray(updateData[field])) {
        profile[field] = updateData[field].map((item) =>
          typeof item === "string" ? item.trim() : item
        );
      } else {
        profile[field] = updateData[field];
      }
    }
  });

  await profile.save();

  // Populate linked user details for response
  await profile.populate("userId", "name email phone emailVerified isActive createdAt");

  let message = "Chef profile updated successfully.";
  if (reVerificationTriggered) {
    message =
      "Your profile changes include critical identity or kitchen safety details. In compliance with safety standards, your account status has been reset to 'pending' for Admin re-verification. Kitchen operations are temporarily paused.";
  } else if (statusChangedToPending) {
    message =
      "Your revised profile details have been submitted. Your application status is now 'pending' Admin review.";
  }

  return {
    profile,
    message,
    reVerificationTriggered,
  };
};

/**
 * Retrieves the current approval status of the chef.
 * @param {string|mongoose.Types.ObjectId} userId
 */
export const getChefApprovalStatus = async (userId) => {
  const profile = await ChefProfile.findOne({ userId }).select(
    "kitchenName approvalStatus rejectionReason reviewedAt createdAt"
  );

  if (!profile) {
    const error = new Error("Chef profile not found for this account.");
    error.statusCode = 404;
    throw error;
  }

  return {
    kitchenName: profile.kitchenName,
    approvalStatus: profile.approvalStatus,
    rejectionReason: profile.rejectionReason,
    reviewedAt: profile.reviewedAt,
    submittedAt: profile.createdAt,
  };
};
