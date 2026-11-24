// Application errors are safe to expose only when their message is intentionally public.
class AppError extends Error {
  constructor(message, statusCode = 500, options = {}) {
    super(message, options);
    this.name = new.target.name;
    this.statusCode = statusCode;
  }
}
class ValidationError extends AppError {
  constructor(message = "Validation failed", options) { super(message, 400, options); }
}
class AuthenticationError extends AppError {
  constructor(message = "Authentication required", options) { super(message, 401, options); }
}
class AuthorizationError extends AppError {
  constructor(message = "Forbidden", options) { super(message, 403, options); }
}
class NotFoundError extends AppError {
  constructor(message = "Resource not found", options) { super(message, 404, options); }
}
class ConflictError extends AppError {
  constructor(message = "Conflict", options) { super(message, 409, options); }
}
class RateLimitError extends AppError {
  constructor(message = "Too many requests; try again later", options) { super(message, 429, options); }
}
class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable", options) { super(message, 503, options); }
}
class DatabaseError extends AppError {
  constructor(message = "Database operation failed", options = {}) { super(message, 500, options); }
}
module.exports = { AppError, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError, RateLimitError, ServiceUnavailableError, DatabaseError };
