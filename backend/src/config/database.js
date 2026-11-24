const { Sequelize } = require("sequelize");
const logger = require("../utils/logger");
require("dotenv").config();

// Fail-fast checks for required env variables
const requiredEnvVars = ["DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST"];
requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    logger.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: "postgres",
    logging: (msg) => logger.debug(msg),
    pool: {
      max: process.env.NODE_ENV === "test" ? 50 : 20,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

// Test the connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info("Database connection established successfully.");
  } catch (error) {
    logger.error("Unable to connect to the database:", error);
    process.exit(1);
  }
};

// Initialize models and their relationships
const initModels = async () => {
  // Import models
  const models = require("../models");

  // Initialize models with sequelize instance
  Object.values(models).forEach((model) => {
    if (typeof model.initialize === "function") {
      model.initialize(sequelize);
    }
  });

  // Set up associations between models
  Object.values(models).forEach((model) => {
    if (typeof model.associate === "function") {
      model.associate(models);
    }
  });

  // Sync models with database
  if (
    process.env.NODE_ENV === "development" &&
    process.env.DB_SYNC === "true"
  ) {
    await sequelize.sync({ alter: true });
    logger.info("Database synchronized");
  }
};

module.exports = {
  sequelize,
  testConnection,
  initModels,
};
