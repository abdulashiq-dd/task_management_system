
// ==========================================
// JOB ERROR CLASSIFICATION
// MILESTONE 9
// ==========================================

// ==========================================
// 1. NON-RETRYABLE ERROR
// ==========================================

class NonRetryableError extends Error {

  constructor(message, code = "NON_RETRYABLE_ERROR") {

    super(message);

    this.name = "NonRetryableError";
    this.code = code;
    this.retryable = false;
  }
}

// ==========================================
// 2. RETRYABLE ERROR
// ==========================================

class RetryableError extends Error {

  constructor(message, code = "RETRYABLE_ERROR") {

    super(message);

    this.name = "RetryableError";
    this.code = code;
    this.retryable = true;
  }
}

// ==========================================
// 3. ERROR CLASSIFICATION
// ==========================================

function isRetryableError(error) {

  if (!error) {
    return false;
  }

  // Explicit non-retryable errors.
  if (
    error instanceof NonRetryableError ||
    error.retryable === false
  ) {
    return false;
  }

  // Explicit retryable errors.
  if (
    error instanceof RetryableError ||
    error.retryable === true
  ) {
    return true;
  }

  // Permanent validation and programming errors.
  const permanentErrorNames = new Set([
    "ValidationError",
    "CastError",
    "TypeError",
    "ReferenceError",
    "SyntaxError",
    "RangeError",
    "StrictModeError"
  ]);

  if (permanentErrorNames.has(error.name)) {
    return false;
  }

  // MongoDB duplicate key and authentication errors.
  const permanentErrorCodes = new Set([
    11000,
    13,
    18
  ]);

  if (permanentErrorCodes.has(error.code)) {
    return false;
  }

  // Temporary network failures.
  const temporaryErrorCodes = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "EPIPE",
    "ENETUNREACH",
    "EHOSTUNREACH"
  ]);

  if (temporaryErrorCodes.has(error.code)) {
    return true;
  }

  // MongoDB connection-related failures.
  const temporaryErrorNames = new Set([
    "MongoNetworkError",
    "MongoNetworkTimeoutError",
    "MongoServerSelectionError",
    "MongoNotConnectedError",
    "MongoOperationTimeoutError",
    "MongooseServerSelectionError"
  ]);

  if (temporaryErrorNames.has(error.name)) {
    return true;
  }

  // HTTP-related errors.
  const statusCode =
    error.statusCode ||
    error.status ||
    error.response?.status;

  if (
    statusCode === 408 ||
    statusCode === 429 ||
    (statusCode >= 500 && statusCode <= 599)
  ) {
    return true;
  }

  if (statusCode >= 400 && statusCode <= 499) {
    return false;
  }

  // Defensive default:
  // Unknown errors should not be retried blindly.
  return false;
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  RetryableError,
  NonRetryableError,
  isRetryableError
};
