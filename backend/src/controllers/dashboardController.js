const { forwardApiError } = require("../middleware/errorMiddleware");
const dashboardService = require("../services/dashboardService");

const getDashboard = async (req, res, next) => {
  try {
    const dashboard = await dashboardService.getDashboardStats({
      id: req.user.id,
      role: req.user.role,
    });

    return res.status(200).json({
      success: true,
      message: "Dashboard fetched successfully",
      dashboard,
    });
  } catch (error) {
    return forwardApiError(error, res, next);
  }
};

module.exports = { getDashboard };