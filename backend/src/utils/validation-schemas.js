const Joi = require("joi");

// Schema for requesting OTP

exports.requestOTPSchema = Joi.object({
  mobileNumber: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .allow(null, "") // allow empty but will validate through .or()
    .messages({
      "string.pattern.base": "Mobile number must be between 10-15 digits",
    }),
  email: Joi.string()
    .email()
    .allow(null, "") // allow empty but will validate through .or()
    .messages({
      "string.email": "Email must be a valid email address",
    }),
  fcmToken: Joi.string().allow(null, ""),
  countryCode: Joi.string().pattern(/^[0-9]{1,4}$/).default("91"),
})
  .custom((value, helpers) => {
    if (
      (!value.mobileNumber || value.mobileNumber.trim() === "") &&
      (!value.email || value.email.trim() === "")
    ) {
      return helpers.error("any.custom", {
        message: "Either mobileNumber or email must be provided",
      });
    }
    return value;
  })
  .messages({
    "any.custom": "{{#message}}",
  });

// Schema for verifying OTP
exports.verifyOTPSchema = Joi.object({
  uuid: Joi.string()
    .guid({ version: ["uuidv4"] })
    .required()
    .messages({
      "string.guid": "UUID must be a valid UUID",
      "any.required": "UUID is required",
    }),
  otp: Joi.string()
    .length(4)
    .pattern(/^[0-9]+$/)
    .required()
    .messages({
      "string.length": "OTP must be 4 digits",
      "string.pattern.base": "OTP must contain only digits",
      "any.required": "OTP is required",
    }),
  verificationId: Joi.string().allow(null, ""),
  countryCode: Joi.string().pattern(/^[0-9]{1,4}$/).default("91"),
});

// Schema for google auth
exports.googleAuthSchema = Joi.object({
  idToken: Joi.string().required("idToken is required"),
});

// Schema for admin login
exports.adminLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

// Schema for creating listener
exports.listenerSchema = Joi.object({
  name: Joi.string().required(),
  mobileNumber: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .required(),
  email: Joi.string().email().allow(null, ""),
  profile: Joi.object().allow(null),
});

// Schema for admin creating a listener/astrologer user
exports.adminCreateUserSchema = Joi.object({
  fullName: Joi.string().required(),
  mobileNumber: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .required(),
  role: Joi.number().valid(2, 4).required(), // 2 = listener, 4 = astrologer
  age: Joi.number().integer().min(1).max(120).required(),
  language: Joi.array().items(Joi.string().trim().min(1)).min(1).required(),
  profile: Joi.object().optional().default({}),
  rating: Joi.number().min(0).max(5).optional().default(0),
});

// Schema for admin updating an existing listener/astrologer profile (all fields optional – PATCH)
exports.adminUpdateUserSchema = Joi.object({
  fullName: Joi.string().optional(),
  mobileNumber: Joi.string().pattern(/^[0-9]{10,15}$/).optional().messages({
    "string.pattern.base": "Mobile number must be between 10-15 digits",
  }),
  age: Joi.number().integer().min(1).max(120).optional(),
  language: Joi.array().items(Joi.string().trim().min(1)).min(1).optional(),
  profile: Joi.object().optional(),
  rating: Joi.number().min(0).max(5).optional(),
});

// Listener global pricing (admin)
exports.createListenerPricingSchema = Joi.object({
  serviceType: Joi.string()
    .valid('chat', 'audio_call', 'video_call')
    .required(),
  pricePerMinute: Joi.number()
    .positive()
    .precision(2)
    .max(9999999.99)
    .required(),
  effectiveFrom: Joi.date().required(),
});

// Update listener global pricing (admin)
exports.updateListenerPricingSchema = Joi.object({
  pricePerMinute: Joi.number()
    .positive()
    .precision(2)
    .max(9999999.99)
    .optional(),
  isActive: Joi.boolean().optional(),
}).or('pricePerMinute', 'isActive')
  .messages({
    'object.missing': 'At least one of pricePerMinute or isActive must be provided',
  });

// Astrologer custom pricing
exports.createAstrologerPricingSchema = Joi.object({
  serviceType: Joi.string()
    .valid('chat', 'audio_call', 'video_call')
    .required(),
  pricePerMinute: Joi.number()
    .positive()
    .precision(2)
    .max(9999999.99)
    .required(),
  userId: Joi.forbidden() // Reject any payload with userId
    .messages({
      'any.unknown': 'userId is not allowed in this request'
    }),
});
exports.updateAstrologerPricingSchema = Joi.object({
  pricePerMinute: Joi.number()
    .positive()
    .precision(2)
    .max(9999999.99)
    .required(),
  isActive: Joi.boolean().optional(),
  userId: Joi.forbidden(),
});
exports.serviceTypeParamSchema = Joi.object({
  serviceType: Joi.string()
    .valid('chat', 'audio_call', 'video_call')
    .required(),
});

// Listener custom pricing (admin sets per-listener price override)
exports.createListenerCustomPricingSchema = Joi.object({
  serviceType: Joi.string()
    .valid('chat', 'audio_call', 'video_call')
    .required(),
  pricePerMinute: Joi.number()
    .positive()
    .precision(2)
    .max(9999999.99)
    .required(),
});

exports.updateListenerCustomPricingSchema = Joi.object({
  pricePerMinute: Joi.number()
    .positive()
    .precision(2)
    .max(9999999.99)
    .optional(),
  isActive: Joi.boolean().optional(),
}).or('pricePerMinute', 'isActive')
  .messages({
    'object.missing': 'At least one of pricePerMinute or isActive must be provided',
  });


// Commission schemas
exports.createCommissionSchema = Joi.object({
  role: Joi.string()
    .valid('listener', 'astrologer')
    .required()
    .messages({
      'any.required': 'Role is required',
      'any.only': 'Role must be either listener or astrologer',
    }),
  serviceType: Joi.string()
    .valid('chat', 'audio_call', 'video_call')
    .required()
    .messages({
      'any.required': 'Service type is required',
      'any.only': 'Service type must be chat, audio_call, or video_call',
    }),
  commissionPercentage: Joi.number()
    .min(0)
    .max(100)
    .precision(2)
    .required()
    .messages({
      'number.min': 'Commission percentage must be at least 0',
      'number.max': 'Commission percentage cannot exceed 100',
      'any.required': 'Commission percentage is required',
    }),
  effectiveFrom: Joi.date()
    .optional()
    .messages({
      'date.base': 'Effective from must be a valid date',
    }),
});

exports.updateCommissionSchema = Joi.object({
  commissionPercentage: Joi.number()
    .min(0)
    .max(100)
    .precision(2)
    .optional()
    .messages({
      'number.min': 'Commission percentage must be at least 0',
      'number.max': 'Commission percentage cannot exceed 100',
    }),
  isActive: Joi.boolean().optional(),
}).or('commissionPercentage', 'isActive')
  .messages({
    'object.missing': 'At least one of commissionPercentage or isActive must be provided',
  });

exports.calculateCommissionSchema = Joi.object({
  grossAmount: Joi.number()
    .positive()
    .precision(2)
    .required()
    .messages({
      'number.positive': 'Gross amount must be a positive number',
      'any.required': 'Gross amount is required',
    }),
  role: Joi.string()
    .valid('listener', 'astrologer')
    .required()
    .messages({
      'any.required': 'Role is required',
      'any.only': 'Role must be either listener or astrologer',
    }),
  serviceType: Joi.string()
    .valid('chat', 'audio_call', 'video_call')
    .required()
    .messages({
      'any.required': 'Service type is required',
      'any.only': 'Service type must be chat, audio_call, or video_call',
    }),
});


// Schema for Message Central VerifyNow
exports.sendOtpSchema = Joi.object({
  mobileNumber: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .required()
    .messages({
      "string.pattern.base": "Mobile number must be between 10-15 digits",
      "any.required": "Mobile number is required",
    }),
  countryCode: Joi.string()
    .pattern(/^[0-9]{1,4}$/)
    .default("91")
    .messages({
      "string.pattern.base": "Country code must be 1-4 digits",
    }),
});

exports.validateOtpSchema = Joi.object({
  verificationId: Joi.string().required().messages({
    "any.required": "Verification ID is required",
  }),
  code: Joi.string()
    .pattern(/^[0-9]+$/)
    .required()
    .messages({
      "string.pattern.base": "OTP code must contain only digits",
      "any.required": "OTP code is required",
    }),
});

// Schema for Firebase Phone Authentication (iOS / Android)
// The mobile app uses the Firebase SDK to verify the OTP on-device and
// receives an idToken. This token is sent here for backend verification.
exports.firebasePhoneAuthSchema = Joi.object({
  idToken: Joi.string().required().messages({
    "any.required": "Firebase idToken is required",
    "string.base": "Firebase idToken must be a string",
  }),
  fcmToken: Joi.string().allow(null, "").optional(),
});

// Roles an announcement can be targeted at
const ANNOUNCEMENT_TARGET_ROLES = ["user", "listener", "astrologer"];

const targetRolesSchema = Joi.array()
  .items(Joi.string().valid(...ANNOUNCEMENT_TARGET_ROLES))
  .min(1)
  .unique()
  .messages({
    "array.min": "targetRoles must contain at least one role",
    "array.unique": "targetRoles must not contain duplicate roles",
    "any.only": `targetRoles may only contain: ${ANNOUNCEMENT_TARGET_ROLES.join(", ")}`,
  });

// Schema for creating an announcement (admin)
exports.createAnnouncementSchema = Joi.object({
  message: Joi.string().trim().min(1).max(2000).required().messages({
    "string.empty": "Message is required",
    "string.max": "Message must be at most 2000 characters",
    "any.required": "Message is required",
  }),
  targetRoles: targetRolesSchema.optional(),
});

// Schema for updating an announcement (admin)
exports.updateAnnouncementSchema = Joi.object({
  message: Joi.string().trim().min(1).max(2000).optional().messages({
    "string.empty": "Message cannot be empty",
    "string.max": "Message must be at most 2000 characters",
  }),
  isActive: Joi.boolean().optional(),
  targetRoles: targetRolesSchema.optional(),
})
  .or("message", "isActive", "targetRoles")
  .messages({
    "object.missing":
      "At least one of message, isActive or targetRoles must be provided",
  });

// Schema for submitting bank information
exports.bankInfoSchema = Joi.object({
  accountHolderName: Joi.string().required(),
  accountNumber: Joi.string().pattern(/^[0-9]{9,18}$/).required().messages({
    "string.pattern.base": "Account number must be between 9 and 18 digits",
  }),
  ifscCode: Joi.string().pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).required().messages({
    "string.pattern.base": "Invalid IFSC code format",
  }),
  bankName: Joi.string().required(),
  branchName: Joi.string().allow(null, "").optional(),
  accountType: Joi.string().valid("savings", "current").required(),
  upiId: Joi.string().allow(null, "").optional(),
});

// ========== ADMIN DASHBOARD ==========

const ONE_YEAR_MS = 366 * 24 * 60 * 60 * 1000;

const dashboardRangeKeys = {
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
};

const limitRangeLength = (value, helpers) => {
  const { from, to } = value;
  if (from && to) {
    if (from >= to) return helpers.message("from must be before to");
    if (to - from > ONE_YEAR_MS) return helpers.message("Date range cannot exceed one year");
  }
  return value;
};

// Query for dashboard endpoints that take only a date range
exports.dashboardRangeSchema = Joi.object(dashboardRangeKeys).custom(limitRangeLength);

// Query for GET /dashboard/trends
exports.dashboardTrendSchema = Joi.object({
  ...dashboardRangeKeys,
  metric: Joi.string()
    .valid("new_users", "recharge_revenue", "gross_spend", "commission", "listener_earnings", "sessions", "talk_minutes")
    .required(),
  interval: Joi.string().valid("day", "week", "month").default("day"),
}).custom(limitRangeLength);

// Query for GET /dashboard/practitioners/top
exports.dashboardTopPractitionersSchema = Joi.object({
  ...dashboardRangeKeys,
  sortBy: Joi.string().valid("earnings", "minutes", "conversations", "rating").default("earnings"),
  role: Joi.string().valid("listener", "astrologer").optional(),
  limit: Joi.number().integer().min(1).max(100).default(10),
}).custom(limitRangeLength);

// ========== ADMIN SERVER LOGS ==========

const logFilterKeys = {
  level: Joi.string().lowercase().valid("error", "warn", "info", "http", "verbose", "debug").optional(),
  search: Joi.string().trim().min(1).max(200).optional(),
};

// Query for GET /logs/:file
exports.logReadQuerySchema = Joi.object({
  ...logFilterKeys,
  limit: Joi.number().integer().min(1).max(1000).default(200),
  cursor: Joi.number().integer().min(0).optional(),
});

// Query for GET /logs/:file/follow
exports.logFollowQuerySchema = Joi.object({
  ...logFilterKeys,
  after: Joi.number().integer().min(0).required(),
});

// Query for DELETE /logs
exports.logCleanupQuerySchema = Joi.object({
  olderThanDays: Joi.number().integer().min(1).max(365).required(),
});

// ========== ADMIN USER LIST ==========

// Query for GET /user/:roleid/admin-panel
exports.adminUserListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow("").max(100).default(""),
  sortBy: Joi.string().valid("createdAt", "name", "lastLogin", "rating", "age").default("createdAt"),
  order: Joi.string().lowercase().valid("asc", "desc").default("desc"),
  hasRecharged: Joi.boolean().optional(),
});
