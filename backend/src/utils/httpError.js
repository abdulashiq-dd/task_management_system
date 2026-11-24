function createError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}
module.exports = { createError };
