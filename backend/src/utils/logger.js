const winston = require("winston");
const path = require("path");
const DailyRotateFile = require("winston-daily-rotate-file");

const logDirectory = path.join(__dirname, "..", "..", "logs");

// Define log format
// A string 2nd argument (logger.error("msg:", err.message)) is dropped by winston unless a
// format puts it into the message. The Console transport's `simple()` prints it as meta, but
// this printf does not, so file logs ended at "FCM send failed:". The format below appends it.
const appendStringArgs = winston.format((info) => {
  const extras = info[Symbol.for("splat")];
  if (Array.isArray(extras)) {
    const text = extras.filter((e) => typeof e === "string" || typeof e === "number").join(" ");
    if (text) info.message = `${info.message} ${text}`;
  }
  return info;
});

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  appendStringArgs(),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

// One file per day per stream (combined-2026-10-09.log, error-2026-10-09.log).
// Files older than LOG_RETENTION are deleted automatically. Keep the .log extension
// (no zipping) so the admin log API in services/log.service.js can read them.
const LOG_RETENTION = "14d";

const dailyFile = (name, options = {}) =>
  new DailyRotateFile({
    filename: path.join(logDirectory, `${name}-%DATE%.log`),
    datePattern: "YYYY-MM-DD",
    maxFiles: LOG_RETENTION,
    zippedArchive: false,
    auditFile: path.join(logDirectory, `.${name}-audit.json`),
    format: logFormat,
    ...options,
  });

// Define transports
const transports = [
  dailyFile("error", { level: "error" }),
  dailyFile("combined"),
];

// Add console logging only in development
if (process.env.NODE_ENV !== "production") {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        appendStringArgs(),
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

const logger = winston.createLogger({
  level: "info",
  transports,
});

module.exports = logger;
