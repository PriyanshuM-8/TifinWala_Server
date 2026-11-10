import ChefProfile from "../Models/ChefProfile.js";

/**
 * Reusable middleware ensuring a Chef account has been formally approved by an Admin.
 * Rejects pending or rejected chefs with specific, actionable error messages.
 * Attaches the verified chefProfile document to `req.chefProfile`.
 */
export const requireApprovedChef = async (req, res, next) => {
  // 1. Verify user authentication exists
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required before accessing chef operations.",
    });
  }

  // 2. Verify user has the 'chef' role
  if (req.user.role !== "chef") {
    return res.status(403).json({
      success: false,
      message: "Access restricted to chef partners only.",
    });
  }

  try {
    // 3. Find the chef's profile by userId
    const profile = await ChefProfile.findOne({ userId: req.user._id });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Chef profile not found. Please complete initial chef onboarding.",
      });
    }

    // 4. Check approvalStatus
    if (profile.approvalStatus === "pending") {
      return res.status(403).json({
        success: false,
        approvalStatus: "pending",
        message:
          "Your chef profile is currently pending Admin approval. Kitchen, menu, and order operations are restricted until approval.",
      });
    }

    if (profile.approvalStatus === "rejected") {
      return res.status(403).json({
        success: false,
        approvalStatus: "rejected",
        message: `Your chef application was rejected. Reason: ${
          profile.rejectionReason || "Requirements not met"
        }. Please update your kitchen profile details for re-evaluation.`,
        rejectionReason: profile.rejectionReason,
      });
    }

    // 5. Approved chef granted access
    req.chefProfile = profile;
    next();
  } catch (error) {
    next(error);
  }
};

export default requireApprovedChef;
