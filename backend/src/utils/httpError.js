const errors = require("../errors/appError");
const types = {
  400: errors.ValidationError, 401: errors.AuthenticationError,
  403: errors.AuthorizationError, 404: errors.NotFoundError,
  409: errors.ConflictError, 429: errors.RateLimitError,
  503: errors.ServiceUnavailableError,
};
// Existing service callers retain the same API and HTTP status codes.
function createError(message, statusCode = 400) {
  const Type = types[statusCode];
  return Type ? new Type(message) : new errors.AppError(message, statusCode);
}
module.exports = { createError, ...errors };
