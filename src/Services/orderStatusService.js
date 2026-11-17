/**
 * Order Status State Transition Service
 *
 * Strict Validated Lifecycle Transitions:
 * - pending_confirmation -> accepted | rejected | cancelled
 * - accepted             -> preparing
 * - preparing            -> ready_for_pickup (customer_pickup only) | out_for_delivery (chef_delivery only)
 * - ready_for_pickup     -> delivered
 * - out_for_delivery     -> delivered
 *
 * Terminal States: delivered, rejected, cancelled
 */

export const ORDER_STATUSES = {
  PENDING_CONFIRMATION: "pending_confirmation",
  ACCEPTED: "accepted",
  PREPARING: "preparing",
  READY_FOR_PICKUP: "ready_for_pickup",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  REJECTED: "rejected",
};

export const TERMINAL_STATUSES = [
  ORDER_STATUSES.DELIVERED,
  ORDER_STATUSES.CANCELLED,
  ORDER_STATUSES.REJECTED,
];

/**
 * Validates whether an order status transition is allowed.
 *
 * @param {string} currentStatus
 * @param {string} targetStatus
 * @param {string} deliveryType - "chef_delivery" or "customer_pickup"
 * @returns {boolean}
 */
export const isValidStatusTransition = (currentStatus, targetStatus, deliveryType) => {
  if (currentStatus === targetStatus) return false;

  // Terminal states cannot be transitioned
  if (TERMINAL_STATUSES.includes(currentStatus)) {
    return false;
  }

  switch (currentStatus) {
    case ORDER_STATUSES.PENDING_CONFIRMATION:
      return [
        ORDER_STATUSES.ACCEPTED,
        ORDER_STATUSES.REJECTED,
        ORDER_STATUSES.CANCELLED,
      ].includes(targetStatus);

    case ORDER_STATUSES.ACCEPTED:
      return [
        ORDER_STATUSES.PREPARING,
        ORDER_STATUSES.CANCELLED,
        ORDER_STATUSES.REJECTED,
      ].includes(targetStatus);

    case ORDER_STATUSES.PREPARING:
      if (deliveryType === "customer_pickup") {
        return targetStatus === ORDER_STATUSES.READY_FOR_PICKUP;
      }
      if (deliveryType === "chef_delivery") {
        return targetStatus === ORDER_STATUSES.OUT_FOR_DELIVERY;
      }
      return false;

    case ORDER_STATUSES.READY_FOR_PICKUP:
      return targetStatus === ORDER_STATUSES.DELIVERED;

    case ORDER_STATUSES.OUT_FOR_DELIVERY:
      return targetStatus === ORDER_STATUSES.DELIVERED;

    default:
      return false;
  }
};

/**
 * Validates transition and throws descriptive error if invalid.
 */
export const assertValidStatusTransition = (currentStatus, targetStatus, deliveryType) => {
  if (!isValidStatusTransition(currentStatus, targetStatus, deliveryType)) {
    const error = new Error(
      `Invalid order status transition from '${currentStatus}' to '${targetStatus}' for delivery type '${deliveryType}'.`
    );
    error.statusCode = 400;
    throw error;
  }
};
