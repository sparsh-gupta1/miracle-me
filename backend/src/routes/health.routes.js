const express = require('express');
const router = express.Router();
const redisClient = require('../config/redis');
const { sequelize } = require('../config/database');

/**
 * Health check endpoint for deployment verification
 * Returns 200 if all systems are operational, 503 if degraded
 */
router.get('/health', async (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: require('../../package.json').version,
        services: {},
    };

    let isHealthy = true;

    // Check database connection
    try {
        await sequelize.authenticate();
        health.services.database = {
            status: 'connected',
            type: 'PostgreSQL',
        };
    } catch (error) {
        health.services.database = {
            status: 'disconnected',
            error: error.message,
        };
        isHealthy = false;
    }

    // Check Redis connection
    try {
        if (redisClient && redisClient.isOpen) {
            await redisClient.ping();
            health.services.redis = {
                status: 'connected',
            };
        } else {
            throw new Error('Redis client not initialized');
        }
    } catch (error) {
        health.services.redis = {
            status: 'disconnected',
            error: error.message,
        };
        // Redis is not critical, so we mark as degraded instead of unhealthy
        health.status = 'degraded';
    }

    // Overall health status
    if (!isHealthy) {
        health.status = 'unhealthy';
    }

    const statusCode = health.status === 'ok' ? 200 : 503;
    return res.status(statusCode).json(health);
});

/**
 * Readiness check - returns 200 when app is ready to accept traffic
 */
router.get('/ready', (req, res) => {
    res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
    });
});

/**
 * Liveness check - returns 200 if app is running
 */
router.get('/live', (req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

module.exports = router;
