import {
  getAllChefs,
  getChefById,
  approveChefApplication,
  rejectChefApplication,
  updateChefStatus,
  getChefOrders,
  getChefFoods,
  getChefEarnings,
  getChefWalletsOverview,
  getChefCommissionTransactions,
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

/**
 * PATCH /api/admin/chefs/:id/status
 * Admin suspends or reactivates a chef account.
 */
export const updateChefStatusHandler = async (req, res, next) => {
  try {
    const { isActive, reason } = req.body;
    const result = await updateChefStatus(req.params.id, req.user._id, {
      isActive,
      reason,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/chefs/:id/orders
 */
export const getChefOrdersHandler = async (req, res, next) => {
  try {
    const { page, limit, orderStatus } = req.query;
    const result = await getChefOrders(req.params.id, {
      page,
      limit,
      orderStatus,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/chefs/:id/foods
 */
export const getChefFoodsHandler = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await getChefFoods(req.params.id, { page, limit });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/chefs/:id/earnings
 */
export const getChefEarningsHandler = async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;
    const result = await getChefEarnings(req.params.id, {
      page,
      limit,
      status,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/chefs/:id/wallets
 */
export const getChefWalletsHandler = async (req, res, next) => {
  try {
    const result = await getChefWalletsOverview(req.params.id);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/chefs/:id/transactions
 */
export const getChefCommissionTransactionsHandler = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await getChefCommissionTransactions(req.params.id, {
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
