
const reportService = require(
  "../services/reportService"
);

// ==========================================
// GENERATE REPORT
// POST /api/reports/generate
// ==========================================

async function generateReport(req, res) {

  try {

    const currentUser = {

      id: req.user?.id,

      role: req.user?.role

    };

    // Wait only for metadata creation
    // and background job submission.

    const job = await reportService.generateReport(

      req.body,

      currentUser

    );

    return res
      .location(`/api/jobs/${job.id}`)
      .status(202)
      .json({

        success: true,

        message:
          "Report generation job queued successfully",

        job,

        exportId: job.exportId,

        statusUrl: `/api/jobs/${job.id}`,

        exportUrl: `/api/exports/${job.exportId}`

      });

  } catch (error) {

    const statusCode = error.statusCode || 500;

    console.error(

      "[Report Controller] Error:",

      error.message

    );

    return res.status(statusCode).json({

      success: false,

      message:

        statusCode >= 500 && statusCode !== 503

          ? "Internal server error"

          : error.message

    });

  }

}

// ==========================================
// EXPORT CONTROLLER
// ==========================================

module.exports = {

  generateReport

};
