/**
 * Middleware to catch 404 Not Found for undefined routes.
 */
export const notFound = (req, res, next) => {
  const error = new Error(`Resource not found - ${req.method} ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Centralized error handling middleware.
 */
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  let message = err.message || "Internal Server Error";
  let errors = null;

  // Handle Mongoose Bad ObjectId (CastError)
  if (err.name === "CastError" && err.kind === "ObjectId") {
    statusCode = 404;
    message = "Resource not found with the specified identifier.";
  }

  // Handle Mongoose Validation Errors
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Validation Error";
    errors = Object.values(err.errors).map((val) => val.message);
  }

  // Handle Mongoose Duplicate Key Error (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    const duplicatedField = Object.keys(err.keyValue || {})[0] || "field";
    message = `An account with this ${duplicatedField} already exists.`;
  }

  // Handle JWT Errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid authorization token.";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Authorization token has expired.";
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(errors && { errors }),
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
