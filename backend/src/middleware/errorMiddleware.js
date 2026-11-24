const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  // Mongoose validation errors
  if (err.name === "ValidationError") {
    return res.status(400).json({
      message: err.message
    });
  }

  // Invalid MongoDB ObjectId
  if (err.name === "CastError") {
    return res.status(400).json({
      message: "Invalid resource ID"
    });
  }

  // Duplicate email / unique field
  if (err.code === 11000) {
    const fields = Object.keys(err.keyPattern || {}).filter(key => /^[A-Za-z][A-Za-z0-9_.]{0,99}$/.test(key));
    return res.status(409).json({
      message: fields.includes("email") ? "Email already registered" : fields.length ? `Duplicate value for unique field: ${fields.join(", ")}` : "A record with the same unique field already exists"
    });
  }

  // Custom errors from controllers and services
  const statusCode =
    Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode < 600
      ? err.statusCode
      : Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;

  if (statusCode >= 500) {
    logger.error("errorMiddleware error", err);
  }

  return res.status(statusCode).json({
    message:
      statusCode >= 500
        ? "Internal server error"
        : err.message
  });
};

module.exports = errorHandler;
