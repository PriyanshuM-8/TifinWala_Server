import {
  listAllCustomers,
  getCustomerDetails,
  updateCustomerStatus,
  getCustomerOrders,
  getCustomerSubscriptions,
  getCustomerRewardsOverview,
} from "../Services/adminCustomerService.js";

/**
 * GET /api/admin/customers
 */
export async function listCustomersHandler(req, res, next) {
  try {
    const { search, isActive, page, limit } = req.query;
    const result = await listAllCustomers({ search, isActive, page, limit });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/customers/:customerId
 */
export async function getCustomerDetailsHandler(req, res, next) {
  try {
    const result = await getCustomerDetails(req.params.customerId);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/customers/:customerId/status
 */
export async function updateCustomerStatusHandler(req, res, next) {
  try {
    const { isActive, reason } = req.body;
    const customer = await updateCustomerStatus(req.params.customerId, req.user._id, {
      isActive,
      reason,
    });

    return res.status(200).json({
      success: true,
      message: `Customer account ${customer.isActive ? "activated" : "deactivated"} successfully.`,
      customer,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/customers/:customerId/orders
 */
export async function getCustomerOrdersHandler(req, res, next) {
  try {
    const { page, limit, orderStatus } = req.query;
    const result = await getCustomerOrders(req.params.customerId, {
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
}

/**
 * GET /api/admin/customers/:customerId/subscriptions
 */
export async function getCustomerSubscriptionsHandler(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await getCustomerSubscriptions(req.params.customerId, {
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
}

/**
 * GET /api/admin/customers/:customerId/rewards
 */
export async function getCustomerRewardsHandler(req, res, next) {
  try {
    const result = await getCustomerRewardsOverview(req.params.customerId);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}
