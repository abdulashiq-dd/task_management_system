
const errorHandler = (err, req, res, next) => {
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
    return res.status(409).json({
      message: "Email already registered"
    });
  }

  // Custom errors from controllers and services
  const statusCode =
    Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode < 600
      ? err.statusCode
      : 500;

  if (statusCode >= 500) {
    console.error(err);
  }

  return res.status(statusCode).json({
    message:
      statusCode >= 500
        ? "Internal server error"
        : err.message
  });
};

module.exports = errorHandler;
