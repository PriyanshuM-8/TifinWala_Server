import {
  getChefProfile,
  updateChefProfile,
  getChefApprovalStatus,
} from "../Services/chefService.js";

/**
 * GET /api/chef/profile
 * Authenticated chef can view their own profile.
 */
export const getMyProfile = async (req, res, next) => {
  try {
    const profile = await getChefProfile(req.user._id);

    return res.status(200).json({
      success: true,
      profile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/chef/profile
 * Chef can update allowed profile fields with safe re-verification policy.
 */
export const updateMyProfile = async (req, res, next) => {
  try {
    const result = await updateChefProfile(req.user._id, req.body);

    return res.status(200).json({
      success: true,
      message: result.message,
      reVerificationTriggered: result.reVerificationTriggered,
      profile: result.profile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chef/approval-status
 * Return current approval status and rejection reason if applicable.
 */
export const getMyApprovalStatus = async (req, res, next) => {
  try {
    const statusData = await getChefApprovalStatus(req.user._id);

    return res.status(200).json({
      success: true,
      ...statusData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chef/kitchen/operations
 * Test endpoint protected with requireApprovedChef to verify access control.
 */
export const testApprovedKitchenOperation = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Authorized: Kitchen operations accessible for approved chef.",
    kitchen: {
      id: req.chefProfile._id,
      kitchenName: req.chefProfile.kitchenName,
      approvalStatus: req.chefProfile.approvalStatus,
    },
  });
};
