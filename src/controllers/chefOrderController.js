import {
  getChefOrders,
  getChefOrderById,
  acceptOrderByChef,
  rejectOrderByChef,
  updateChefOrderStatus,
} from "../Services/orderService.js";

/**
 * GET /api/chef/orders
 * Approved chef views orders assigned to their kitchen.
 */
export const getChefOrdersHandler = async (req, res, next) => {
  try {
    const result = await getChefOrders(req.user._id, req.query);
    return res.status(200).json({
      success: true,
      message: "Chef orders retrieved successfully.",
      data: result.orders,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chef/orders/:orderId
 * Approved chef views a specific order assigned to them.
 */
export const getChefOrderByIdHandler = async (req, res, next) => {
  try {
    const order = await getChefOrderById(req.user._id, req.params.orderId);
    return res.status(200).json({
      success: true,
      message: "Chef order retrieved successfully.",
      order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/chef/orders/:orderId/accept
 * Approved chef accepts a pending_confirmation order.
 */
export const acceptOrderHandler = async (req, res, next) => {
  try {
    const order = await acceptOrderByChef(req.user._id, req.params.orderId);
    return res.status(200).json({
      success: true,
      message: "Order accepted successfully. You may now begin food preparation.",
      order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/chef/orders/:orderId/reject
 * Approved chef rejects a pending_confirmation order with a reason.
 */
export const rejectOrderHandler = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;
    const order = await rejectOrderByChef(
      req.user._id,
      req.params.orderId,
      rejectionReason
    );
    return res.status(200).json({
      success: true,
      message: "Order rejected. Customer notified and stock restored.",
      order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/chef/orders/:orderId/status
 * Approved chef updates order status (preparing -> ready_for_pickup / out_for_delivery -> delivered).
 */
export const updateOrderStatusHandler = async (req, res, next) => {
  try {
    const { status } = req.body;
    const order = await updateChefOrderStatus(
      req.user._id,
      req.params.orderId,
      status
    );
    return res.status(200).json({
      success: true,
      message: `Order status advanced to '${order.orderStatus}'.`,
      order,
    });
  } catch (error) {
    next(error);
  }
};
