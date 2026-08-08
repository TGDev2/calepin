/**
 * The shape "still open" is reasoned about in (CAL-020).
 *
 * Structural, not Prisma types — the same reason `order/types.ts` gives: a
 * narrative rule must run without a database (CLAUDE.md §8), and the
 * repository layer that will read these rows does not exist yet (CAL-023). A
 * caller passes its own row type and gets its own row type back.
 */

/** The three states a thread carries — CLOSED is the only terminal one. */
export type ThreadStatus = "OPEN" | "CONTINUED" | "CLOSED";

/** What deciding whether a thread is still open needs, and nothing else. */
export interface OpenableThread {
  status: ThreadStatus;
}
