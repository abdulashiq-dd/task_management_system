const activityService = require("../services/activityService");

const getActivity = async (req, res, next) => {
  try {
    const { activities, pagination } = await activityService.getActivity(req.user, req.query);
    return res.status(200).json({
      success: true,
      message: "Activity fetched successfully",
      count: activities.length,
      activities,
      pagination,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getActivity };
