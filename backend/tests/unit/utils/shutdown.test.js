const { createShutdown, isShuttingDown, resetShutdownState } = require("../../../src/utils/shutdown");

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  resetShutdownState();
});

afterEach(() => jest.useRealTimers());

describe("createShutdown", () => {
  it("runs the steps in order, then exits with the given code", async () => {
    const order = [];
    const exit = jest.fn();
    const shutdown = createShutdown({
      logger,
      exit,
      steps: [
        { name: "a", run: async () => order.push("a") },
        { name: "b", run: () => order.push("b") },
      ],
    });

    await shutdown("SIGTERM", 0);

    expect(order).toEqual(["a", "b"]);
    expect(exit).toHaveBeenCalledWith(0);
    expect(isShuttingDown()).toBe(true);
  });

  it("ignores a second shutdown while one is running", async () => {
    const run = jest.fn();
    const exit = jest.fn();
    const shutdown = createShutdown({ logger, exit, steps: [{ name: "a", run }] });

    await shutdown("SIGINT", 0);
    await shutdown("uncaughtException", 1);

    expect(run).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("logs a failing step and still runs the rest", async () => {
    const later = jest.fn();
    const exit = jest.fn();
    const shutdown = createShutdown({
      logger,
      exit,
      steps: [
        { name: "broken", run: async () => { throw new Error("boom"); } },
        { name: "later", run: later },
      ],
    });

    await shutdown("SIGTERM", 0);

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("broken"), expect.any(Error));
    expect(later).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits after forceExitMs when a step never finishes", async () => {
    jest.useFakeTimers();
    const exit = jest.fn();
    const shutdown = createShutdown({
      logger,
      exit,
      forceExitMs: 8000,
      steps: [{ name: "stuck", run: () => new Promise(() => {}) }],
    });

    shutdown("uncaughtException", 1);
    await jest.advanceTimersByTimeAsync(8000);

    expect(exit).toHaveBeenCalledWith(1);
  });
});
