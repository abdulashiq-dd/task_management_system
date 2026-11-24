const { createError } = require("./httpError");
function pagination(query = {}, defaultLimit = 20) {
  function parse(value, fallback, max, name) {
    if (value === undefined) return fallback;
    if (typeof value !== "string" && typeof value !== "number") throw createError(`Invalid ${name}`);
    if (!/^[1-9]\d*$/.test(String(value))) throw createError(`Invalid ${name}`);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number > max) throw createError(`Invalid ${name}`);
    return number;
  }
  const page = parse(query.page, 1, 100000, "page");
  const limit = parse(query.limit, defaultLimit, 100, "limit");
  return { page, limit, skip: (page - 1) * limit };
}
function pageInfo(page, limit, total) { return { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total, hasPreviousPage: page > 1 }; }
module.exports = { pagination, pageInfo };
