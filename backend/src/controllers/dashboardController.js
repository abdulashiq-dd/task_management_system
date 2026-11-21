const dashboardService = require("../services/dashboardService");

const getDashboard = async (req, res) => {
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
    console.error("Dashboard Error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: "Failed to fetch dashboard",
    });
  }
};

module.exports = { getDashboard };