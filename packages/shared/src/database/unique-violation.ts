/**
 * A `P2002`, recognised without importing `@prisma/client` as a value.
 *
 * `./client` keeps that import type-only so the `unit` Vitest project runs
 * without `prisma generate` having produced anything, and this module is
 * underneath it. The shape is Prisma's public error contract, so reading the
 * code off it is not a guess.
 *
 * It lives here rather than beside its first caller because it has two: a
 * unique index is how `reserveGeneration` arbitrates a race for one ask
 * (CAL-058), and how `writeGeneratedAnalysisWithin` finds out that somebody
 * else created the project's analysis, or saved a section, while it was working
 * (CAL-209). One predicate, so the two cannot come to disagree about what a
 * collision looks like.
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
