
const mongoose = require("mongoose");

const { createError } = require("./httpError");
const { taskVisibility } = require("./taskAccess");

function buildExportFilter(currentUser, filters = {}) {

  // 1. Authentication

  if (
    !currentUser ||
    !mongoose.isValidObjectId(currentUser.id)
  ) {
    throw createError("Authentication required", 401);
  }

  if (!["user", "admin"].includes(currentUser.role)) {
    throw createError("Invalid user role", 403);
  }

  if (
    !filters ||
    typeof filters !== "object" ||
    Array.isArray(filters)
  ) {
    throw createError("Invalid export filters");
  }

  const allowedFilters = [
    "status",
    "priority",
    "search",
    "tag",
    "fromDate",
    "toDate"
  ];

  for (const key of Object.keys(filters)) {

    if (!allowedFilters.includes(key)) {
      throw createError(`Unsupported filter: ${key}`);
    }

  }

  const conditions = [];

  // 2. User authorization

  if (currentUser.role !== "admin") conditions.push(taskVisibility(currentUser));

  // 3. Status filter

  if (filters.status !== undefined) {

    if (
      !["pending", "in_progress", "completed"]
        .includes(filters.status)
    ) {
      throw createError("Invalid task status");
    }

    conditions.push({
      status: filters.status
    });

  }

  // 4. Priority filter

  if (filters.priority !== undefined) {

    if (
      !["low", "medium", "high"]
        .includes(filters.priority)
    ) {
      throw createError("Invalid task priority");
    }

    conditions.push({
      priority: filters.priority
    });

  }

  // 5. Search filter

  if (filters.search !== undefined) {

    if (
      typeof filters.search !== "string" ||
      filters.search.length > 200
    ) {
      throw createError("Invalid search value");
    }

    const search = filters.search.trim();

    if (search) {

      const escapedSearch = search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      conditions.push({
        $or: [
          {
            title: {
              $regex: escapedSearch,
              $options: "i"
            }
          },
          {
            description: {
              $regex: escapedSearch,
              $options: "i"
            }
          }
        ]
      });

    }

  }

  // 6. Tag filter

  if (filters.tag !== undefined) {

    if (
      typeof filters.tag !== "string" ||
      filters.tag.length > 100
    ) {
      throw createError("Invalid tag");
    }

    if (filters.tag.trim()) {

      conditions.push({
        tags: filters.tag.trim()
      });

    }

  }

  // 7. Date filters

  const dateFilter = {};

  function parseDate(value, field) {

    if (
      typeof value !== "string" &&
      !(value instanceof Date)
    ) {
      throw createError(`Invalid ${field}`);
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw createError(`Invalid ${field}`);
    }

    return date;

  }

  if (filters.fromDate !== undefined) {

    dateFilter.$gte = parseDate(
      filters.fromDate,
      "fromDate"
    );

  }

  if (filters.toDate !== undefined) {

    const endDate = parseDate(
      filters.toDate,
      "toDate"
    );

    endDate.setUTCHours(0, 0, 0, 0);

    endDate.setUTCDate(
      endDate.getUTCDate() + 1
    );

    dateFilter.$lt = endDate;

  }

  if (
    dateFilter.$gte &&
    dateFilter.$lt &&
    dateFilter.$gte >= dateFilter.$lt
  ) {
    throw createError("Invalid date range");
  }

  if (Object.keys(dateFilter).length > 0) {

    conditions.push({
      dueDate: dateFilter
    });

  }

  // 8. Final MongoDB filter

  return conditions.length > 0
    ? { $and: conditions }
    : {};

}

module.exports = {
  buildExportFilter
};
