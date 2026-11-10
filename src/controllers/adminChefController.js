import {
  getAllChefs,
  getChefById,
  approveChefApplication,
  rejectChefApplication,
} from "../Services/adminChefService.js";

/**
 * GET /api/admin/chefs
 * Admin can list all chefs with filtering, pagination, and search.
 */
export const listAllChefs = async (req, res, next) => {
  try {
    const { status, search, page, limit, sortBy, sortOrder } = req.query;

    const result = await getAllChefs({
      status,
      search,
      page,
      limit,
      sortBy,
      sortOrder,
    });

    return res.status(200).json({
      success: true,
      count: result.chefs.length,
      pagination: result.pagination,
      chefs: result.chefs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/chefs/:id
 * Admin can view complete details of a specific chef.
 */
export const getChefDetails = async (req, res, next) => {
  try {
    const profile = await getChefById(req.params.id);

    return res.status(200).json({
      success: true,
      profile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/chefs/:id/approve
 * Admin approves a pending chef application.
 */
export const approveChef = async (req, res, next) => {
  try {
    const result = await approveChefApplication(req.params.id, req.user._id);

    return res.status(200).json({
      success: true,
      message: result.message,
      profile: result.profile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/chefs/:id/reject
 * Admin rejects a chef application with required reason.
 */
export const rejectChef = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;

    const result = await rejectChefApplication(
      req.params.id,
      req.user._id,
      rejectionReason
    );
 
    return res.status(200).json({
      success: true,
      message: result.message,
      profile: result.profile,
    });
  } catch (error) {
    next(error);
  }
};
