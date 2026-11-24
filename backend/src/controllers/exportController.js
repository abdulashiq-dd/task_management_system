const { createError } = require("../utils/httpError");
const logger = require("../utils/logger");
const { forwardApiError } = require("../middleware/errorMiddleware");

const {
  queueExportJob
} = require("../services/exportJobService");

const {
  getAllExports,
  getExportById,
  getExportDownload
} = require("../services/exportReadService");

const {
  FILE_TYPES
} = require("../config/fileStorage");

// ==========================================
// 1. GET AUTHENTICATED USER
// ==========================================

function getCurrentUser(req) {

  return {
    id: req.user?.id,
    role: req.user?.role
  };

}

// ==========================================
// 3. VALIDATE EXPORT REQUEST BODY
// ==========================================

function getFilters(body = {}) {

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {

    throw createError("Invalid export request", 400);

  }

  const unsupportedFields =
    Object.keys(body).filter(
      key => key !== "filters"
    );

  if (unsupportedFields.length > 0) {

    throw createError("Only the filters field is supported", 400);

  }

  const filters =
    body.filters === undefined
      ? {}
      : body.filters;

  if (
    !filters ||
    typeof filters !== "object" ||
    Array.isArray(filters)
  ) {

    throw createError("Filters must be an object", 400);

  }

  return filters;

}

// ==========================================
// 4. COMMON EXPORT CONTROLLER
// ==========================================

async function queueExport(req, res, next, type) {

  try {

    const currentUser = getCurrentUser(req);

    const filters = getFilters(req.body);

    const job = await queueExportJob(
      type,
      currentUser,
      filters
    );

    return res
      .location(`/api/jobs/${job.id}`)
      .status(202)
      .json({

        success: true,

        message: "Export job queued successfully",

        job,

        exportId: job.exportId,

        statusUrl: `/api/jobs/${job.id}`,

        exportUrl: `/api/exports/${job.exportId}`

      });

  } catch (error) {

    return forwardApiError(error, res, next);

  }

}

// ==========================================
// 5. JSON EXPORT
// ==========================================

async function exportJSON(req, res, next) {

  return queueExport(
    req,
    res,
    next,
    FILE_TYPES.JSON
  );

}

// ==========================================
// 6. CSV EXPORT
// ==========================================

async function exportCSV(req, res, next) {

  return queueExport(
    req,
    res,
    next,
    FILE_TYPES.CSV
  );

}

// ==========================================
// 7. LIST EXPORTS
// GET /api/exports
// ==========================================

async function listExports(req, res, next) {

  try {

    const result = await getAllExports(

      getCurrentUser(req),

      req.query

    );

    res.set("Cache-Control", "private, no-store");

    return res.status(200).json({

      success: true,

      message: "Exports fetched successfully",

      count: result.exports.length,

      ...result

    });

  } catch (error) {

    return forwardApiError(error, res, next);

  }

}

// ==========================================
// 8. GET EXPORT METADATA
// GET /api/exports/:id
// ==========================================

async function getExport(req, res, next) {

  try {

    const record = await getExportById(

      req.params.id,

      getCurrentUser(req)

    );

    res.set("Cache-Control", "private, no-store");

    return res.status(200).json({

      success: true,

      message: "Export fetched successfully",

      export: record

    });

  } catch (error) {

    return forwardApiError(error, res, next);

  }

}

// ==========================================
// 9. SECURE FILE DOWNLOAD
// GET /api/exports/:id/download
// ==========================================

async function downloadExport(req, res, next) {

  try {

    const file = await getExportDownload(

      req.params.id,

      getCurrentUser(req)

    );

    res.set({

      "Content-Type": file.mimeType,

      "Cache-Control": "private, no-store",

      "X-Content-Type-Options": "nosniff"

    });

    // Express streams the file to the client.

    return res.download(

      file.filePath,

      file.fileName,

      (error) => {

        if (!error) {

          logger.info("[Export Controller] Download completed");

          return;

        }

        logger.error("[Export Controller] Download failed", error);

        // If transfer has already started,
        // delegate to the Express error handler.

        if (res.headersSent) {
          return next(error);
        }

        res.removeHeader("Content-Disposition");

        res.removeHeader("Content-Length");

        res.removeHeader("Content-Type");

        if (
          error.code === "ENOENT" ||
          error.status === 404
        ) {

          return forwardApiError(createError("Export file not found", 404), res, next);

        }

        return forwardApiError(error, res, next);

      }

    );

  } catch (error) {

    return forwardApiError(error, res, next);

  }

}

// ==========================================
// 10. EXPORT CONTROLLERS
// ==========================================

module.exports = {

  exportJSON,

  exportCSV,

  listExports,

  getExport,

  downloadExport

};
