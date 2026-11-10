import { requireApprovedChef } from "./requireApprovedChef.js";

/**
 * Higher-order middleware to restrict endpoint access to specific roles.
 * @param  {...string} allowedRoles - E.g. 'admin', 'chef', 'customer'
 */
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required before role verification.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Role '${req.user.role}' is not authorized to access this resource.`,
      });
    }

    next();
  };
};

export { requireApprovedChef };
