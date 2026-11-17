import ChefProfile from "../Models/ChefProfile.js";

/**
 * Validates and normalizes GeoJSON Point location for chef kitchen.
 * Coordinates must follow standard [longitude, latitude] order.
 */
export const parseAndValidateChefLocation = (data) => {
  let coords = null;

  if (data.location) {
    if (Array.isArray(data.location.coordinates)) {
      coords = data.location.coordinates;
    } else if (
      data.location.longitude !== undefined &&
      data.location.latitude !== undefined
    ) {
      coords = [data.location.longitude, data.location.latitude];
    } else if (data.location.lng !== undefined && data.location.lat !== undefined) {
      coords = [data.location.lng, data.location.lat];
    }
  } else if (Array.isArray(data.coordinates)) {
    coords = data.coordinates;
  } else if (data.longitude !== undefined && data.latitude !== undefined) {
    coords = [data.longitude, data.latitude];
  } else if (data.lng !== undefined && data.lat !== undefined) {
    coords = [data.lng, data.lat];
  }

  // Location is optional
  if (coords === null || coords === undefined) {
    return undefined;
  }

  if (!Array.isArray(coords) || coords.length !== 2) {
    const error = new Error("Invalid coordinates format: Must be [longitude, latitude].");
    error.statusCode = 400;
    throw error;
  }

  const longitude = Number(coords[0]);
  const latitude = Number(coords[1]);

  if (isNaN(longitude) || isNaN(latitude)) {
    const error = new Error("Invalid coordinates: Longitude and latitude must be valid numbers.");
    error.statusCode = 400;
    throw error;
  }

  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    const error = new Error(
      "Invalid coordinates: Longitude must be between -180 and 180, and latitude between -90 and 90."
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    type: "Point",
    coordinates: [longitude, latitude],
  };
};

// Fields that require safety/identity re-verification if changed by an already approved chef
export const CRITICAL_VERIFICATION_FIELDS = [
  "kitchenName",
  "ownerName",
  "kitchenAddress",
  "city",
  "foodSafetyDetails",
];

// All allowed editable fields
export const ALLOWED_UPDATE_FIELDS = [
  "kitchenName",
  "ownerName",
  "kitchenAddress",
  "city",
  "description",
  "foodCategories",
  "cuisineTypes",
  "foodSafetyDetails",
  "kitchenImages",
  "serviceRadiusKm",
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
    const currentVal = (profile[field] || "").toString().trim().toLowerCase();
    const newVal = (updateData[field] || "").toString().trim().toLowerCase();
    return currentVal !== newVal;
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

  // Handle serviceRadiusKm update safely with validation
  if (updateData.serviceRadiusKm !== undefined) {
    const radiusNum = Number(updateData.serviceRadiusKm);
    if (isNaN(radiusNum) || radiusNum < 1 || radiusNum > 50) {
      const error = new Error("Invalid service radius: Must be a number between 1 KM and 50 KM.");
      error.statusCode = 400;
      throw error;
    }
    profile.serviceRadiusKm = radiusNum;
  }

  // Handle GeoJSON Location updates safely
  const parsedLocation = parseAndValidateChefLocation(updateData);
  if (parsedLocation !== undefined) {
    profile.location = parsedLocation;
  }

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
