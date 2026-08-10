/**
 * Stopping a worker without losing work (CAL-060).
 *
 * CAL-060's acceptance criterion is one sentence — *l'arrêt du travailleur ne
 * perd aucune tâche* — and it splits into two cases that BullMQ answers
 * differently, both of which have to hold:
 *
 * - **A job that has started.** `worker.close()` stops fetching new jobs and
 *   waits for the active ones to finish. Its lock is held throughout, so no
 *   other worker steals it, and the process leaves only once the handler has
 *   returned. This is the case the grace period exists for.
 * - **A job that has not started.** It is still `waiting` in Redis and nothing
 *   about the shutdown touches it. The next worker to come up takes it. Losing
 *   it was never possible; the thing that would lose it is a *forced* close
 *   that killed the process while the job was active, which is why forcing is
 *   the exception here and not the default.
 *
 * Three things end the wait, and the handle is **idempotent** across all of
 * them: a container orchestrator sends SIGTERM and then SIGINT, an operator
 * presses Ctrl-C twice, and both arrive while the first close is still running.
 *
 * 1. The graceful close finishes → `graceful`.
 * 2. A second signal arrives → `forced`. Someone has decided they want the
 *    process gone more than they want the job.
 * 3. `graceMs` elapses → `forced`. A handler that hangs must not hang a deploy.
 *
 * `installSignalHandlers` takes its emitter and its exit function as arguments.
 * That is what lets the unit test drive the whole path without a real signal —
 * and it is not only convenient: Windows cannot deliver a catchable SIGTERM to
 * a child process, so a test that sent one would prove nothing on the machine
 * this repository is developed on.
 */

import { errorLogFields } from "../errors";
import { type Logger, logger as processLogger } from "../logging";

export const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

export type ShutdownSignal = (typeof SHUTDOWN_SIGNALS)[number];

/** How the process came to a stop. */
export type ShutdownOutcome = "graceful" | "forced";

/**
 * How long a worker is given to finish what it is doing. Longer than the
 * longest handler would strand a deploy; shorter than one would abandon the
 * work the graceful path exists to protect. Thirty seconds is the value most
 * orchestrators default their own kill grace to.
 */
export const DEFAULT_SHUTDOWN_GRACE_MS = 30_000;

export interface GracefulShutdownOptions {
  /** Waits for in-flight work — `worker.close()`. */
  readonly stop: () => Promise<void>;
  /** Gives up on it — `worker.close(true)`. Optional; `stop` is used if absent. */
  readonly forceStop?: () => Promise<void>;
  /**
   * Released after the worker has stopped, whichever way: producers,
   * connections, the database pool. Failures here are logged, never rethrown —
   * the work is already safe and a noisy exit would mask that.
   */
  readonly release?: () => Promise<void>;
  readonly graceMs?: number;
  readonly logger?: Logger;
}

export interface ShutdownHandle {
  /**
   * Asks the process to stop. Safe to call any number of times: the first call
   * starts the graceful close, a later one forces it, and every call resolves
   * with the same outcome as the run they joined.
   */
  requestShutdown(signal?: ShutdownSignal | string): Promise<ShutdownOutcome>;
  /** Resolves when the shutdown has finished, or never, if none was asked for. */
  readonly finished: Promise<ShutdownOutcome>;
  /** Whether a shutdown is under way or done. */
  isShuttingDown(): boolean;
}

export function createGracefulShutdown(options: GracefulShutdownOptions): ShutdownHandle {
  const {
    stop,
    forceStop = stop,
    release,
    graceMs = DEFAULT_SHUTDOWN_GRACE_MS,
    logger = processLogger,
  } = options;

  let started = false;
  let forced = false;
  /**
   * Terminal once set. A shutdown that has finished has nothing left to force,
   * and the orchestrator that sends SIGTERM then SIGINT a moment later is the
   * ordinary case, not an edge one — without this, that second signal would
   * escalate a run that was already over and call `stop` a second time.
   */
  let settled = false;
  let settle: (outcome: ShutdownOutcome) => void = () => {};

  const finished = new Promise<ShutdownOutcome>((resolve) => {
    settle = resolve;
  });

  function conclude(outcome: ShutdownOutcome): void {
    if (settled) {
      return;
    }

    settled = true;
    settle(outcome);
  }

  async function run(signal: string | undefined): Promise<void> {
    logger.info("worker.shutdown-requested", signal === undefined ? {} : { signal });

    // Whichever of the three finishes first decides the outcome. `stop` is not
    // abandoned when it loses — nothing can un-await it — but the process no
    // longer waits on it, which is the entire meaning of a grace period.
    const timer = setTimeout(() => {
      if (!forced && !settled) {
        forced = true;
        logger.warn("worker.shutdown-timed-out", { durationMs: graceMs });
        void escalate();
      }
    }, graceMs);

    // A pending timer must not be the reason the process stays alive once the
    // work is done and the event loop is otherwise empty.
    timer.unref?.();

    try {
      await stop();
    } catch (error: unknown) {
      logger.error("worker.shutdown-failed", errorLogFields(error));
      forced = true;
    } finally {
      clearTimeout(timer);
    }

    await releaseResources();

    conclude(forced ? "forced" : "graceful");
  }

  async function escalate(): Promise<void> {
    try {
      await forceStop();
    } catch (error: unknown) {
      logger.error("worker.force-stop-failed", errorLogFields(error));
    }

    await releaseResources();

    conclude("forced");
  }

  let released = false;

  async function releaseResources(): Promise<void> {
    if (released || release === undefined) {
      return;
    }

    released = true;

    try {
      await release();
    } catch (error: unknown) {
      logger.error("worker.release-failed", errorLogFields(error));
    }
  }

  return {
    requestShutdown(signal) {
      if (!started) {
        started = true;
        void run(signal);

        return finished;
      }

      if (!forced && !settled) {
        forced = true;
        logger.warn(
          "worker.shutdown-forced",
          signal === undefined ? {} : { signal: String(signal) },
        );
        void escalate();
      }

      return finished;
    },
    finished,
    isShuttingDown: () => started,
  };
}

/** The slice of `process` the installer needs, so a test can supply its own. */
export interface SignalTarget {
  on(signal: string, listener: () => void): unknown;
  off?(signal: string, listener: () => void): unknown;
}

export interface InstallSignalHandlersOptions {
  readonly handle: ShutdownHandle;
  readonly target: SignalTarget;
  /** Called with 0 after a graceful stop, 1 after a forced one. */
  readonly exit: (code: number) => void;
  readonly signals?: readonly string[];
}

/**
 * Binds the signals to the handle and exits once it has settled.
 *
 * Returns an uninstaller, so a test — or a shell that stops for a reason other
 * than a signal — can take the listeners back off.
 */
export function installSignalHandlers(options: InstallSignalHandlersOptions): () => void {
  const { handle, target, exit, signals = SHUTDOWN_SIGNALS } = options;

  const listeners = signals.map((signal) => {
    const listener = (): void => {
      void handle.requestShutdown(signal).then((outcome) => {
        exit(outcome === "graceful" ? 0 : 1);
      });
    };

    target.on(signal, listener);

    return { signal, listener };
  });

  return () => {
    for (const { signal, listener } of listeners) {
      target.off?.(signal, listener);
    }
  };
}
