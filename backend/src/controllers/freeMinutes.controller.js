const freeMinutesService = require("../services/freeMinutes.service");
const logger = require("../utils/logger");

class FreeMinutesController {
  /**
   * Create or update free minutes configuration (Admin only)
   * POST /api/free-minutes
   */
  async setFreeMinutesConfig(req, res) {
    try {
      const { serviceType, freeMinutes } = req.body;
      const adminId = req.user.id;

      if (!serviceType || freeMinutes === undefined) {
        return res.status(400).json({
          success: false,
          error: "Service type and free minutes are required",
        });
      }

      if (freeMinutes < 0) {
        return res.status(400).json({
          success: false,
          error: "Free minutes cannot be negative",
        });
      }

      const config = await freeMinutesService.setFreeMinutesConfig(
        serviceType,
        freeMinutes,
        adminId,
      );

      res.json({
        success: true,
        config: {
          id: config.id,
          serviceType: config.service_type,
          freeMinutes: config.free_minutes,
          isActive: config.is_active,
          createdAt: config.created_at,
          updatedAt: config.updated_at,
        },
      });
    } catch (error) {
      logger.error("Error setting free minutes config:", error);
      res.status(500).json({
        success: false,
        error: "Failed to set free minutes configuration",
      });
    }
  }

  /**
   * Get all free minutes configurations (Admin only)
   * GET /api/free-minutes
   */
  async getAllConfigs(req, res) {
    try {
      const configs = await freeMinutesService.getAllFreeMinutesConfigs();

      res.json({
        success: true,
        configs: configs.map((config) => ({
          id: config.id,
          serviceType: config.service_type,
          freeMinutes: config.free_minutes,
          isActive: config.is_active,
          createdAt: config.created_at,
          updatedAt: config.updated_at,
        })),
      });
    } catch (error) {
      logger.error("Error getting free minutes configs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get free minutes configurations",
      });
    }
  }

  /**
   * Get free minutes configuration for specific service type (Admin only)
   * GET /api/free-minutes/:serviceType
   */
  async getConfigByServiceType(req, res) {
    try {
      const { serviceType } = req.params;

      const config = await freeMinutesService.getFreeMinutesConfig(serviceType);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: `No free minutes configuration found for ${serviceType}`,
        });
      }

      res.json({
        success: true,
        config: {
          id: config.id,
          serviceType: config.service_type,
          freeMinutes: config.free_minutes,
          isActive: config.is_active,
          createdAt: config.created_at,
          updatedAt: config.updated_at,
        },
      });
    } catch (error) {
      logger.error("Error getting free minutes config:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get free minutes configuration",
      });
    }
  }

  /**
   * Disable free minutes for a service type (Admin only)
   * DELETE /api/free-minutes/:serviceType
   */
  async disableFreeMinutes(req, res) {
    try {
      const { serviceType } = req.params;

      const disabled = await freeMinutesService.disableFreeMinutes(serviceType);

      if (!disabled) {
        return res.status(404).json({
          success: false,
          error: `No free minutes configuration found for ${serviceType}`,
        });
      }

      res.json({
        success: true,
        message: `Free minutes disabled for ${serviceType}`,
      });
    } catch (error) {
      logger.error("Error disabling free minutes:", error);
      res.status(500).json({
        success: false,
        error: "Failed to disable free minutes",
      });
    }
  }

  /**
   * Get current user's free minutes usage (User)
   * GET /api/free-minutes/my-usage
   */
  async getMyUsage(req, res) {
    try {
      const userId = req.user.id;

      const usage = await freeMinutesService.getAllUserFreeMinutesUsage(userId);

      res.json({
        success: true,
        usage,
      });
    } catch (error) {
      logger.error("Error getting user free minutes usage:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get free minutes usage",
      });
    }
  }

  /**
   * Get current user's free minutes usage for specific service type (User)
   * GET /api/free-minutes/my-usage/:serviceType
   */
  async getMyUsageByServiceType(req, res) {
    try {
      const userId = req.user.id;
      const { serviceType } = req.params;

      const usage = await freeMinutesService.getUserFreeMinutesUsage(
        userId,
        serviceType,
      );

      if (!usage) {
        return res.json({
          success: true,
          usage: {
            serviceType,
            totalFreeMinutes: 0,
            totalFreeSeconds: 0,
            consumedMinutes: 0,
            consumedSeconds: 0,
            remainingMinutes: 0,
            remainingSeconds: 0,
          },
        });
      }

      res.json({
        success: true,
        usage: {
          serviceType: usage.service_type,
          totalFreeMinutes: Math.floor(usage.total_free_seconds / 60),
          totalFreeSeconds: usage.total_free_seconds,
          consumedMinutes: Math.floor(usage.consumed_seconds / 60),
          consumedSeconds: usage.consumed_seconds,
          remainingMinutes: Math.floor(usage.remaining_seconds / 60),
          remainingSeconds: usage.remaining_seconds,
        },
      });
    } catch (error) {
      logger.error("Error getting user free minutes usage:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get free minutes usage",
      });
    }
  }
}

module.exports = new FreeMinutesController();
