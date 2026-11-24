const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const routes = require("./routes");
const { errorHandler } = require("./middlewares/error.middleware");

const app = express();

// Trust proxy for rate limiting (behind Nginx/Cloudflare)
app.set("trust proxy", 1);

// Security & performance middlewares
app.use(helmet());
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003"];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(compression());

// Logger middleware
app.use(morgan("dev"));

// Body parser with raw body support for webhook verification
app.use(
  express.json({
    limit: "13mb",
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Health check routes (must be before /api routes for proper routing)
const healthRoutes = require("./routes/health.routes");
app.use("/", healthRoutes);

// Mount all routes
app.use("/api", routes);

// Centralized error handling
app.use(errorHandler);

module.exports = app;
