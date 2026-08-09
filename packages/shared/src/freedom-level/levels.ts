/**
 * The three freedom levels of the specification, from the most faithful to the
 * most free (CAL-044).
 *
 * The order is the design, not a presentation choice: `freedomLevelRank` is
 * read off it, and every invariant this module asserts — the treatment of a
 * dimension never tightens as the level rises, the departure budget never
 * shrinks — is stated against that order.
 *
 * **The members are spelled as the schema spells them.** CLAUDE.md §4.2 asks
 * for lowercase members in a shared literal union and uses this very constant
 * as its example, but `FreedomLevel` is a Prisma enum CAL-012 declared and this
 * list mirrors *it* rather than the other way round — the same case
 * `PROJECT_STATUSES` already made, for the same reason: a lowercase spelling
 * would buy nothing and cost a translation at the column, the `where` clause
 * and the French label table. `prisma/schema.test.ts` pins the two lists
 * against each other.
 *
 * **This file imports nothing**, so the whole policy stays runnable by the
 * `unit` Vitest project with no database and no generated client, and
 * `apps/web` can read it without coming near the data-access seam (§3.5).
 */

export const FREEDOM_LEVELS = [
  "LOW", // faible
  "BALANCED", // équilibré
  "HIGH", // élevé
] as const;

export type FreedomLevel = (typeof FREEDOM_LEVELS)[number];

export function isFreedomLevel(value: unknown): value is FreedomLevel {
  return typeof value === "string" && (FREEDOM_LEVELS as readonly string[]).includes(value);
}

/**
 * How far along the scale a level sits. Only ever compared, never displayed —
 * the number is an index into an order, not a quantity of freedom (that is
 * `sourceDepartureBudget`, which counts what the policy actually permits).
 */
export function freedomLevelRank(level: FreedomLevel): number {
  return FREEDOM_LEVELS.indexOf(level);
}
