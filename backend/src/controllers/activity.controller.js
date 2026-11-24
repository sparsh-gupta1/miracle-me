exports.getActivityByUserId = async (req, res, next) => {
  const { id } = req.user;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  try {
    const activityData = await activityService.getActivityByUserId(
      id,
      page,
      limit
    );

    res.json({
      success: true,
      data: activityData,
    });
  } catch (error) {
    logger.error("Error fetching chats:", error);
    next(error);
  }
};
