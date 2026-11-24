
const mongoose = require("mongoose");

const {
  Export,
  EXPORT_STATUS
} = require("../models/exportModel");

const {
  FILE_TYPES,
  getFilePath,
  fileExists
} = require("../config/fileStorage");

// ==========================================
// 1. CUSTOM ERROR
// ==========================================

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// ==========================================
// 2. VALIDATE AUTHENTICATED USER
// ==========================================

function validateUser(currentUser) {

  if (
    !currentUser ||
    !mongoose.isValidObjectId(currentUser.id)
  ) {
    throw createError(
      "Authentication required",
      401
    );
  }

  if (!["user", "admin"].includes(currentUser.role)) {
    throw createError(
      "Invalid user role",
      403
    );
  }

}

// ==========================================
// 3. BUILD AUTHORIZATION FILTER
// ==========================================

function buildAccessFilter(currentUser) {

  validateUser(currentUser);

  // Admin can access all exports.

  if (currentUser.role === "admin") {
    return {};
  }

  // Regular users can access only their exports.

  return {
    userId: new mongoose.Types.ObjectId(
      currentUser.id
    )
  };

}

// ==========================================
// 4. FORMAT EXPORT METADATA
// ==========================================

function formatExport(record) {

  const id = String(record._id);

  const isDownloadable =
    record.status === EXPORT_STATUS.COMPLETED;

  return {

    id,

    userId: String(record.userId),

    backgroundJobId: record.backgroundJobId,

    type: record.type,

    fileName: record.fileName,

    mimeType: record.mimeType,

    size: record.size,

    totalRecords: record.totalRecords,

    status: record.status,

    filters: record.filters || {},

    error: record.error,

    isDownloadable,

    downloadUrl: isDownloadable
      ? `/api/exports/${id}/download`
      : null,

    createdAt: record.createdAt,

    updatedAt: record.updatedAt,

    completedAt: record.completedAt,

    failedAt: record.failedAt

  };

}

// ==========================================
// 5. VALIDATE PAGINATION
// ==========================================

function parsePositiveInteger(
  value,
  defaultValue,
  maxValue,
  fieldName
) {

  if (value === undefined) {
    return defaultValue;
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw createError(
      `Invalid ${fieldName}`,
      400
    );
  }

  if (!/^[1-9]\d*$/.test(String(value))) {
    throw createError(
      `Invalid ${fieldName}`,
      400
    );
  }

  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number > maxValue
  ) {
    throw createError(
      `Invalid ${fieldName}`,
      400
    );
  }

  return number;

}

// ==========================================
// 6. GET ALL EXPORTS
// ==========================================

async function getAllExports(
  currentUser,
  query = {}
) {

  const filter = buildAccessFilter(
    currentUser
  );

  const allowedFields = [
    "type",
    "status",
    "page",
    "limit"
  ];

  for (const key of Object.keys(query)) {

    if (!allowedFields.includes(key)) {
      throw createError(
        `Unsupported query parameter: ${key}`,
        400
      );
    }

  }

  const { type, status } = query;

  // Filter by export type.

  if (type !== undefined) {

    if (!Object.values(FILE_TYPES).includes(type)) {
      throw createError(
        "Invalid export type",
        400
      );
    }

    filter.type = type;

  }

  // Filter by export status.

  if (status !== undefined) {

    if (
      !Object.values(EXPORT_STATUS).includes(status)
    ) {
      throw createError(
        "Invalid export status",
        400
      );
    }

    filter.status = status;

  }

  // Pagination.

  const page = parsePositiveInteger(
    query.page,
    1,
    100000,
    "page"
  );

  const limit = parsePositiveInteger(
    query.limit,
    10,
    100,
    "limit"
  );

  const skip = (page - 1) * limit;

  // Execute independent database queries concurrently.

  const [records, total] = await Promise.all([

    Export.find(filter)
      .sort({
        createdAt: -1,
        _id: -1
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    Export.countDocuments(filter)

  ]);

  return {

    exports: records.map(formatExport),

    pagination: {

      page,

      limit,

      total,

      totalPages: Math.ceil(total / limit),

      hasNextPage: page * limit < total,

      hasPreviousPage: page > 1

    }

  };

}

// ==========================================
// 7. FIND AUTHORIZED EXPORT
// ==========================================

async function findAuthorizedExport(
  exportId,
  currentUser
) {

  const filter = buildAccessFilter(
    currentUser
  );

  if (
    !mongoose.isObjectIdOrHexString(exportId)
  ) {
    throw createError(
      "Invalid export ID",
      400
    );
  }

  const record = await Export.findOne({

    ...filter,

    _id: exportId

  }).lean();

  // Return 404 for unavailable or unauthorized
  // exports to avoid exposing their existence.

  if (!record) {
    throw createError(
      "Export not found",
      404
    );
  }

  return record;

}

// ==========================================
// 8. GET EXPORT BY ID
// ==========================================

async function getExportById(
  exportId,
  currentUser
) {

  const record = await findAuthorizedExport(
    exportId,
    currentUser
  );

  return formatExport(record);

}

// ==========================================
// 9. PREPARE SECURE FILE DOWNLOAD
// ==========================================

async function getExportDownload(
  exportId,
  currentUser
) {

  // Validate ownership before accessing file.

  const record = await findAuthorizedExport(
    exportId,
    currentUser
  );

  // Download only completed exports.

  if (
    record.status !== EXPORT_STATUS.COMPLETED
  ) {
    throw createError(
      "Export is not ready for download",
      409
    );
  }

  // Verify physical file availability.

  const exists = await fileExists(
    record.type,
    record.fileName
  );

  if (!exists) {
    throw createError(
      "Export file not found",
      404
    );
  }

  // Use the trusted filename stored in MongoDB.
  // Never accept a file path from the client.

  const filePath = getFilePath(
    record.type,
    record.fileName
  );

  return {

    filePath,

    fileName: record.fileName,

    mimeType: record.mimeType,

    size: record.size

  };

}

// ==========================================
// 10. EXPORT FUNCTIONS
// ==========================================

module.exports = {

  getAllExports,

  getExportById,

  getExportDownload

};
