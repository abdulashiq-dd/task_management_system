const { AppError, ValidationError, ConflictError, DatabaseError, ServiceUnavailableError } = require("./appError");
const { QueueProcessingError } = require("../utils/jobErrors");
const databaseNames = new Set(["MongoServerError", "MongoError", "MongoNetworkError", "MongoNetworkTimeoutError", "MongoServerSelectionError", "MongooseServerSelectionError", "MongoNotConnectedError", "MongoOperationTimeoutError", "MongooseError"]);
function normalizeError(error) {
  if (error instanceof AppError) return error;
  if (error?.name === "ValidationError" || error?.name === "StrictModeError") return new ValidationError("Validation failed", { cause: error });
  if (error?.name === "CastError") return new ValidationError("Invalid resource ID", { cause: error });
  if (error?.code === 11000) {
    const fields = Object.keys(error.keyPattern || {}).filter(key => /^[A-Za-z][A-Za-z0-9_.]{0,99}$/.test(key));
    const message = fields.includes("email") ? "Email already registered" : fields.length ? `Duplicate value for unique field: ${fields.join(", ")}` : "A record with the same unique field already exists";
    return new ConflictError(message, { cause: error });
  }
  if (databaseNames.has(error?.name)) return new DatabaseError(undefined, { cause: error });
  if (error instanceof QueueProcessingError) return new AppError("Background job processing failed", 500, { cause: error });
  if (error?.type === "entity.parse.failed") return new ValidationError("Malformed JSON request", { cause: error });
  const status = [error?.statusCode, error?.status].find(value => Number.isInteger(value) && value >= 400 && value < 600) || 500;
  // Backward compatibility for explicitly constructed legacy HTTP errors.
  if (status === 503) return new ServiceUnavailableError(undefined, { cause: error });
  return new AppError(status < 500 && typeof error?.message === "string" ? error.message : "Internal server error", status, { cause: error });
}
module.exports = { normalizeError };
