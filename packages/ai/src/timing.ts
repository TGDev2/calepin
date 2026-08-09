/**
 * The injected clock (CLAUDE.md §8: a unit test touches no clock).
 *
 * Everything time-shaped in this layer — the attempt deadline, the backoff
 * sleep, the duration on the result — goes through a `Scheduler`, so the
 * pipeline's tests drive virtual time instead of waiting through real
 * backoffs.
 */

export interface Scheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const REAL_SCHEDULER: Scheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Resolves after `delayMs`, or as soon as `signal` aborts — whichever comes
 * first. Never rejects: the caller re-checks the signal and decides what an
 * abort means, so cancelling a backoff cannot surface as an error.
 */
export function sleep(scheduler: Scheduler, delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (delayMs <= 0 || signal?.aborted === true) {
      resolve();
      return;
    }

    const finish = (): void => {
      signal?.removeEventListener("abort", onAbort);
      scheduler.clearTimeout(handle);
      resolve();
    };
    const onAbort = (): void => finish();
    const handle = scheduler.setTimeout(finish, delayMs);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
