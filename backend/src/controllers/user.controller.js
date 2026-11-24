const UserService = require("../services/user.service");
const { roles } = require("../utils/CONSTANT");

exports.getUserDetails = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const user = await UserService.getAllUsers(userId);

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

exports.changeUserNameByChatId = async (req, res, next) => {
  const { chatId, nickname } = req.body;
  const { id } = req.user;
  try {
    if (!nickname) {
      return res.status(400).json({
        success: false,
        message: "Nickname is required",
      });
    }
    const user = await UserService.changeUserNameByChatId(chatId, id, nickname);
    res.json({ success: true, data: user, message: "User name changed" });
  } catch (error) {
    next(error);
  }
};

exports.blockUserByUserID = async (req, res, next) => {
  const { userId, isBlock } = req.body;
  const { id } = req.user;
  try {
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }
    await UserService.blockUserByUserID(userId, id, isBlock);
    res.json({
      success: true,
      message: isBlock ? "User unblocked" : "User blocked",
    });
  } catch (error) {
    next(error);
  }
};

// blocked userlist by login user

exports.blockUserList = async (req, res, next) => {
  const { id } = req.user;
  try {
    const blockedUserList = await UserService.blockUserList(id);
    res.json({ success: true, data: blockedUserList });
  } catch (error) {
    next(error);
  }
};

// get profile for chat or public view
exports.getUserProfile = async (req, res, next) => {
  const { id } = req.user;
  const { userId } = req.params;

  try {
    const user = await UserService.getPublicProfile(userId || id, id);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

exports.deleteAccount = async (req, res, next) => {
  const { id } = req.user;
  try {
    await UserService.deleteAccount(id);
    res.json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// Admin: log a user out of all devices
exports.forceLogoutUser = async (req, res, next) => {
  const { userid } = req.params;
  try {
    const result = await UserService.forceLogout(userid, req.user.id);
    res.json({ success: true, data: result, message: "User logged out from all devices" });
  } catch (error) {
    next(error);
  }
};

exports.deleteUser = async (req, res, next) => {
  const { userid } = req.params;
  const { deletionType = "soft" } = req.body;
  try {
    const result = await UserService.deleteUser(userid, deletionType);
    res.json({
      success: true,
      data: result,
      message: result.deleted ? "User permanently deleted" : "User soft deleted",
    });
  } catch (error) {
    next(error);
  }
};

exports.getFavorites = async (req, res, next) => {
  const { id } = req.user;
  try {
    const favorites = await UserService.getFavorites(id);
    res.json({ success: true, data: favorites });
  } catch (error) {
    next(error);
  }
};

exports.toggleFavorite = async (req, res, next) => {
  const { id } = req.user;
  const { favoriteUserId } = req.body;
  try {
    if (!favoriteUserId) {
      return res
        .status(400)
        .json({ success: false, message: "Favorite user ID is required" });
    }
    const result = await UserService.toggleFavorite(id, favoriteUserId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.updateAvailability = async (req, res, next) => {
  const { id } = req.user;
  const { isOnline, isVideoCallAvailable } = req.body;
  try {
    const user = await UserService.updateAvailability(
      id,
      isOnline,
      isVideoCallAvailable,
    );
    res.json({ success: true, data: user, message: "Availability updated" });
  } catch (error) {
    next(error);
  }
};

exports.getAvailability = async (req, res, next) => {
  const { id } = req.user;
  try {
    const availability = await UserService.getAvailability(id);
    res.json({ success: true, data: availability });
  } catch (error) {
    next(error);
  }
};

// dashboard user controller

// get user list by role for admin panel
exports.getUserRoleWise = async (req, res, next) => {
  const { roleid } = req.params;
  // Validated and defaulted by adminUserListQuerySchema
  const { page, limit, search, sortBy, order, hasRecharged } = req.validatedQuery;
  try {
    const users = await UserService.getUserRoleWise(roleid, {
      page,
      limit,
      search,
      sortBy,
      order,
      hasRecharged,
    });
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

// active inActive edit user controller
exports.activeInactiveUser = async (req, res, next) => {
  const { isActive } = req.body;
  const { userid } = req.params;
  try {
    const user = await UserService.activeInactiveUser(userid, isActive);
    res.json({ success: true, data: user, message: "User status updated" });
  } catch (error) {
    next(error);
  }
};

exports.adminCreateUser = async (req, res, next) => {
  const {
    fullName,
    mobileNumber,
    profile = {},
    role,
    age,
    language,
    rating,
  } = req.body;
  try {
    const roleIdNum = Number(role);
    const newUser = await UserService.adminCreateUser({
      name: fullName,
      mobileNumber,
      profileImage: req.file,
      profile,
      roleid: roleIdNum,
      age,
      language,
      rating,
    });
    res
      .status(201)
      .json({ success: true, data: newUser, message: "User created" });
  } catch (error) {
    next(error);
  }
};

exports.adminUpdateUser = async (req, res, next) => {
  const { userid } = req.params;
  const { fullName, mobileNumber, age, language, profile, rating } = req.body;
  try {
    // Reject if nothing to update
    if (!req.file && !fullName && !mobileNumber && age === undefined && !language && !profile && rating === undefined) {
      return res.status(400).json({ success: false, message: "At least one field must be provided to update" });
    }
    const updated = await UserService.adminUpdateUser(userid, {
      name: fullName,
      mobileNumber,
      age,
      language,
      profile,
      profileImage: req.file,
      rating,
    });
    res.json({ success: true, data: updated, message: "User profile updated" });
  } catch (error) {
    next(error);
  }
};

exports.updateBusyStatus = async (req, res, next) => {
  const { id } = req.user;
  const { isBusy } = req.body;
  try {
    if (isBusy === undefined) {
      return res
        .status(400)
        .json({ success: false, message: "isBusy status is required" });
    }
    const isBoolean =
      typeof isBusy === "boolean" || isBusy === "true" || isBusy === "false";
    if (!isBoolean) {
      return res
        .status(400)
        .json({ success: false, message: "isBusy must be a boolean" });
    }
    const user = await UserService.updateBusyStatus(id, isBusy);
    res.json({ success: true, data: user, message: "Busy status updated" });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/push-token
 *
 * Mobile apps must call this endpoint on login and whenever the OS rotates
 * their push token so the backend always has a fresh token to deliver calls.
 *
 * Body:
 *   fcmToken  {string}           – FCM registration token (Android, and iOS chat pushes)
 *   voipToken {string|undefined} – Apple PushKit VoIP token (iOS only)
 *   platform  {"android"|"ios"}  – Device platform
 */
exports.updatePushToken = async (req, res, next) => {
  const { id } = req.user;
  const { fcmToken, voipToken, platform } = req.body;

  try {
    if (!platform || !["android", "ios"].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: 'platform is required and must be "android" or "ios"',
      });
    }
    if (!fcmToken && !voipToken) {
      return res.status(400).json({
        success: false,
        message: "At least one of fcmToken or voipToken is required",
      });
    }

    const updateFields = { platform };
    if (fcmToken !== undefined) updateFields.fcmToken = fcmToken;
    if (voipToken !== undefined) updateFields.voipToken = voipToken;

    await UserService.updatePushToken(id, updateFields);

    res.json({ success: true, message: "Push token updated successfully" });
  } catch (error) {
    next(error);
  }
};

const validationError = (message) => {
  const error = new Error(message);
  error.name = "ValidationError";
  error.errors = [{ message, path: [], type: "custom" }];
  return error;
};

exports.getMe = async (req, res, next) => {
  try {
    res.json({ success: true, data: await UserService.getMe(req.user.id) });
  } catch (error) {
    next(error);
  }
};

exports.updateMe = async (req, res, next) => {
  try {
    const { name, gender, dateOfBirth, birthTime, birthPlace } = req.body || {};
    if (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > 100)) throw validationError("name must be 1-100 characters");
    if (gender !== undefined && !["female", "male", "other"].includes(gender)) throw validationError("gender must be female, male or other");
    if (dateOfBirth !== undefined && !(/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) && !isNaN(Date.parse(dateOfBirth)))) throw validationError("dateOfBirth must be yyyy-MM-dd");
    if (birthTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(birthTime)) throw validationError("birthTime must be HH:mm");
    if (birthPlace !== undefined && (typeof birthPlace !== "string" || birthPlace.length > 200)) throw validationError("birthPlace must be at most 200 characters");
    res.json({ success: true, data: await UserService.updateMe(req.user.id, { name, gender, dateOfBirth, birthTime, birthPlace }) });
  } catch (error) {
    next(error);
  }
};
