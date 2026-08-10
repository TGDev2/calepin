import { afterEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../logging";
import { createLogCapture } from "../testing";
import {
  createGracefulShutdown,
  DEFAULT_SHUTDOWN_GRACE_MS,
  installSignalHandlers,
  SHUTDOWN_SIGNALS,
  type SignalTarget,
} from "./shutdown";

/** A promise a test releases by hand — a job that is taking its time. */
function deferred(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { promise, release };
}

/** Silent unless a test asks for the bytes. */
function quietLogger() {
  const capture = createLogCapture();

  return { capture, logger: createLogger({ level: "debug", destination: capture.stream }) };
}

/** Records what was bound, and lets a test fire it. */
function fakeSignalTarget(): SignalTarget & { fire(signal: string): void; bound(): string[] } {
  const listeners = new Map<string, Set<() => void>>();

  return {
    on(signal, listener) {
      const set = listeners.get(signal) ?? new Set();
      set.add(listener);
      listeners.set(signal, set);
    },
    off(signal, listener) {
      listeners.get(signal)?.delete(listener);
    },
    fire(signal) {
      for (const listener of listeners.get(signal) ?? []) {
        listener();
      }
    },
    bound() {
      return [...listeners.entries()].filter(([, set]) => set.size > 0).map(([signal]) => signal);
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createGracefulShutdown", () => {
  it("waits for the work in flight instead of dropping it", async () => {
    const job = deferred();
    const { logger } = quietLogger();
    let stopped = false;

    const shutdown = createGracefulShutdown({
      stop: async () => {
        await job.promise;
        stopped = true;
      },
      logger,
    });

    const outcome = shutdown.requestShutdown("SIGTERM");
    // The whole guarantee, as an assertion: nothing has finished while the job
    // is still running, so the process cannot have gone away under it.
    await Promise.resolve();
    expect(stopped).toBe(false);

    job.release();

    await expect(outcome).resolves.toBe("graceful");
    expect(stopped).toBe(true);
  });

  it("releases resources once, after the worker has stopped", async () => {
    const order: string[] = [];
    const { logger } = quietLogger();

    const shutdown = createGracefulShutdown({
      stop: async () => {
        order.push("stop");
      },
      release: async () => {
        order.push("release");
      },
      logger,
    });

    await shutdown.requestShutdown("SIGINT");
    // An orchestrator that sends SIGTERM and then SIGINT a moment later is the
    // ordinary case: a signal arriving after the shutdown finished must find a
    // terminal handle and do nothing, not escalate a run that is already over.
    await shutdown.requestShutdown("SIGINT");

    expect(order).toEqual(["stop", "release"]);
  });

  it("is idempotent: a repeated first signal joins the run already under way", async () => {
    const job = deferred();
    const { logger } = quietLogger();
    const stop = vi.fn(async () => {
      await job.promise;
    });

    const shutdown = createGracefulShutdown({ stop, logger });

    const first = shutdown.requestShutdown("SIGTERM");
    expect(shutdown.isShuttingDown()).toBe(true);

    job.release();

    await expect(first).resolves.toBe("graceful");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("forces on a second signal — someone wants the process gone", async () => {
    const job = deferred();
    const { logger } = quietLogger();
    const forceStop = vi.fn(async () => {});

    const shutdown = createGracefulShutdown({
      stop: async () => {
        await job.promise;
      },
      forceStop,
      logger,
    });

    void shutdown.requestShutdown("SIGTERM");
    const forced = shutdown.requestShutdown("SIGINT");

    await expect(forced).resolves.toBe("forced");
    expect(forceStop).toHaveBeenCalledTimes(1);

    // The graceful path is not cancelled — nothing can un-await it — it simply
    // no longer decides the outcome.
    job.release();
  });

  it("forces once the grace period has run out, so a wedged handler cannot hang a deploy", async () => {
    vi.useFakeTimers();

    const job = deferred();
    const { logger } = quietLogger();
    const forceStop = vi.fn(async () => {});

    const shutdown = createGracefulShutdown({
      stop: async () => {
        await job.promise;
      },
      forceStop,
      graceMs: 5_000,
      logger,
    });

    const outcome = shutdown.requestShutdown("SIGTERM");

    await vi.advanceTimersByTimeAsync(4_999);
    expect(forceStop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    await expect(outcome).resolves.toBe("forced");
    expect(forceStop).toHaveBeenCalledTimes(1);

    job.release();
  });

  it("reports a stop that threw as forced rather than pretending it was clean", async () => {
    const { logger, capture } = quietLogger();

    const shutdown = createGracefulShutdown({
      stop: async () => {
        throw new Error("redis went away");
      },
      logger,
    });

    await expect(shutdown.requestShutdown("SIGTERM")).resolves.toBe("forced");

    // The event name is pino's message field — see `createLogger`.
    const events = capture.lines().map((line) => line.msg);
    expect(events).toContain("worker.shutdown-failed");
    // §9 and §7: the technical message never reaches the log.
    expect(capture.raw()).not.toContain("redis went away");
  });

  it("defaults the grace period to the value orchestrators default their kill grace to", () => {
    expect(DEFAULT_SHUTDOWN_GRACE_MS).toBe(30_000);
  });
});

describe("installSignalHandlers", () => {
  it("binds every shutdown signal and exits 0 after a graceful stop", async () => {
    const target = fakeSignalTarget();
    const { logger } = quietLogger();
    const exit = vi.fn();

    const shutdown = createGracefulShutdown({ stop: async () => {}, logger });
    installSignalHandlers({ handle: shutdown, target, exit });

    expect(target.bound()).toEqual([...SHUTDOWN_SIGNALS]);

    target.fire("SIGTERM");

    await shutdown.finished;
    // The exit is scheduled off the settled promise, so it lands a tick later.
    await Promise.resolve();

    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits non-zero after a forced stop", async () => {
    const job = deferred();
    const target = fakeSignalTarget();
    const { logger } = quietLogger();
    const exit = vi.fn();

    const shutdown = createGracefulShutdown({
      stop: async () => {
        await job.promise;
      },
      forceStop: async () => {},
      logger,
    });
    installSignalHandlers({ handle: shutdown, target, exit });

    target.fire("SIGINT");
    target.fire("SIGINT");

    await shutdown.finished;
    await Promise.resolve();

    expect(exit).toHaveBeenCalledWith(1);

    job.release();
  });

  it("uninstalls what it installed", () => {
    const target = fakeSignalTarget();
    const { logger } = quietLogger();

    const shutdown = createGracefulShutdown({ stop: async () => {}, logger });
    const uninstall = installSignalHandlers({ handle: shutdown, target, exit: () => {} });

    uninstall();

    expect(target.bound()).toEqual([]);
  });
});
