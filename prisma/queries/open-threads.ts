import type { Prisma } from "@prisma/client";

/**
 * The read CAL-020 exists to serve: every thread of a plan that is not yet
 * CLOSED, at any instant, with the chapter it opened at.
 *
 * A query definition, not a call — the repository layer that will run it does
 * not exist yet (CLAUDE.md §13, CAL-023). `@calepin/outline` states its own
 * `isThreadOpen` predicate ("not CLOSED") without touching Prisma; this is
 * the same condition expressed as the `where` clause a future repository call
 * will pass straight to `prisma.thread.findMany`, kept in one place so
 * nobody restates it or the include by hand.
 */
export function openThreadsQuery(outlineId: string): Prisma.ThreadFindManyArgs {
  return {
    where: { outlineId, status: { not: "CLOSED" } },
    include: { openingChapter: true },
    orderBy: { createdAt: "asc" },
  };
}
