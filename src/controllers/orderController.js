import {
  createCustomerOrder,
  getCustomerOrders,
  getCustomerOrderById,
  cancelOrderByCustomer,
} from "../Services/orderService.js";

/**
 * POST /api/customer/orders
 * Authenticated customer places an instant order from their cart.
 */
export const createOrderHandler = async (req, res, next) => {
  try {
    const { order, isExisting } = await createCustomerOrder(req.user._id, req.body);
    return res.status(201).json({
      success: true,
      message: isExisting
        ? "Order already exists (idempotent request)."
        : "Order placed successfully! Pending chef confirmation.",
      order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/orders
 * Customer views their historical orders with pagination and status filters.
 */
export const getCustomerOrdersHandler = async (req, res, next) => {
  try {
    const result = await getCustomerOrders(req.user._id, req.query);
    return res.status(200).json({
      success: true,
      message: "Customer orders retrieved successfully.",
      data: result.orders,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/orders/:orderId
 * Customer views details of a single order belonging to them.
 */
export const getCustomerOrderByIdHandler = async (req, res, next) => {
  try {
    const order = await getCustomerOrderById(req.user._id, req.params.orderId);
    return res.status(200).json({
      success: true,
      message: "Order details retrieved successfully.",
      order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/customer/orders/:orderId/cancel
 * Customer cancels a pending_confirmation order.
 */
export const cancelOrderHandler = async (req, res, next) => {
  try {
    const { cancellationReason } = req.body;
    const order = await cancelOrderByCustomer(
      req.user._id,
      req.params.orderId,
      cancellationReason
    );
    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully. Reserved stock has been released.",
      order,
    });
  } catch (error) {
    next(error);
  }
};
