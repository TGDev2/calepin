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
const OPEN_THREADS_INCLUDE = { openingChapter: true } as const satisfies Prisma.ThreadInclude;

/** What the query returns: a thread, with the chapter it opened at. */
export type OpenThread = Prisma.ThreadGetPayload<{ include: typeof OPEN_THREADS_INCLUDE }>;

export function openThreadsQuery(outlineId: string) {
  // `satisfies`, not an annotation. Annotating the return as
  // `Prisma.ThreadFindManyArgs` widens it, and the include stops reaching the
  // result type — `findMany(openThreadsQuery(...))` then hands back a bare
  // `Thread` and the chapter this query exists to carry is not there.
  return {
    where: { outlineId, status: { not: "CLOSED" } },
    include: OPEN_THREADS_INCLUDE,
    orderBy: { createdAt: "asc" },
  } satisfies Prisma.ThreadFindManyArgs;
}
