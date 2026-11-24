const logger = require("../utils/logger");
const { normalizeError } = require("../errors/normalizeError");
const { ServiceUnavailableError } = require("../errors/appError");

// Controllers with an existing success:false response envelope opt in before forwarding.
function forwardApiError(error, res, next) {
  res.locals.apiErrorEnvelope = true;
  return next(error);
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const error = normalizeError(err);
  const statusCode = Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
  if (statusCode >= 500) logger.error("errorMiddleware error", err);
  // Only typed, intentionally public 503 messages are exposed; never expose unknown 5xx details.
  const message = statusCode < 500 || error instanceof ServiceUnavailableError ? error.message : "Internal server error";
  return res.status(statusCode).json({ ...(res.locals?.apiErrorEnvelope ? { success: false } : {}), message });
}
module.exports = errorHandler;
module.exports.forwardApiError = forwardApiError;
