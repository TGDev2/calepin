import type { OpenableThread } from "./types";

/**
 * "Still open" (CAL-020) is every status but CLOSED, not OPEN alone: a thread
 * being actively continued has not been paid off either. CLOSED is the only
 * terminal state.
 */
export function isThreadOpen(thread: OpenableThread): boolean {
  return thread.status !== "CLOSED";
}

/** The still-open threads of a set, in the order they were given. */
export function listOpenThreads<TThread extends OpenableThread>(threads: TThread[]): TThread[] {
  return threads.filter(isThreadOpen);
}
