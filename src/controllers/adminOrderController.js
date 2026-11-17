import {
  listAllOrders,
  getOrderDetails,
  getOrderStatistics,
  cancelOrderByAdmin,
} from "../Services/adminOrderService.js";

/**
 * GET /api/admin/orders
 */
export async function listAllOrdersHandler(req, res, next) {
  try {
    const {
      orderStatus,
      paymentStatus,
      paymentMethod,
      deliveryType,
      chefId,
      customerId,
      search,
      startDate,
      endDate,
      page,
      limit,
    } = req.query;

    const result = await listAllOrders({
      orderStatus,
      paymentStatus,
      paymentMethod,
      deliveryType,
      chefId,
      customerId,
      search,
      startDate,
      endDate,
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
 * GET /api/admin/orders/statistics
 */
export async function getOrderStatisticsHandler(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const statistics = await getOrderStatistics({ startDate, endDate });

    return res.status(200).json({
      success: true,
      statistics,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/orders/:orderId
 */
export async function getOrderDetailsHandler(req, res, next) {
  try {
    const result = await getOrderDetails(req.params.orderId);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/orders/:orderId/cancel
 */
export async function cancelOrderByAdminHandler(req, res, next) {
  try {
    const { reason } = req.body;
    const result = await cancelOrderByAdmin(req.params.orderId, req.user._id, { reason });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}
