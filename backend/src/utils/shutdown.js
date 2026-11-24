let shuttingDown = false;

/** True once a shutdown has started in this process. */
const isShuttingDown = () => shuttingDown;

/**
 * Build the process shutdown routine. It runs once, runs each step in order (a failing step is
 * logged and the rest still run), and always exits: a step that hangs is cut off after
 * forceExitMs so PM2 never has to SIGKILL us mid-cleanup.
 * @param {object} opts
 * @param {Array<{name: string, run: Function}>} opts.steps
 * @param {object} opts.logger
 * @param {Function} [opts.exit] - process.exit by default
 * @param {number} [opts.forceExitMs]
 * @returns {(reason: string, exitCode?: number) => Promise<void>}
 */
function createShutdown({ steps, logger, exit = (code) => process.exit(code), forceExitMs = 8000 }) {
  return async function shutdown(reason, exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn(`⚠️ Shutting down (${reason})...`);

    const forceTimer = setTimeout(() => {
      logger.error(`❌ Shutdown did not finish in ${forceExitMs}ms; exiting now`);
      exit(exitCode || 1);
    }, forceExitMs);
    if (forceTimer.unref) forceTimer.unref();

    for (const step of steps) {
      try {
        await step.run();
        logger.info(`🧹 Shutdown step done: ${step.name}`);
      } catch (err) {
        logger.error(`❌ Shutdown step failed: ${step.name}`, err);
      }
    }

    clearTimeout(forceTimer);
    logger.info("✅ Graceful shutdown completed");
    exit(exitCode);
  };
}

/** Test hook: forget a previous shutdown. */
const resetShutdownState = () => {
  shuttingDown = false;
};

module.exports = { createShutdown, isShuttingDown, resetShutdownState };
