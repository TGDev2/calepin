/**
 * The stages a source text feeds, in the order the work actually travels
 * through them (CAL-046).
 *
 * This is not `BUSINESS_DOMAINS` with two members dropped, even though it reads
 * like it. That list names the packages the code is organised into; this one
 * names the *dependency chain* a source-text edit runs down, and the chain is
 * the whole content of the file: the array order **is** the graph. Stage `n`
 * depends on every stage before it and on nothing after it, so "upstream" needs
 * no second table able to disagree with this one.
 *
 * Coherence and export are absent deliberately. A coherence audit is a reading
 * of the chapters rather than a stage built on them, and an export is a
 * rendering of what exists at the moment it runs — neither is a thing an author
 * would have to redo because the source text moved.
 *
 * This file imports nothing, for the reason `../project-status/statuses.ts`
 * states: the rule must run under the `unit` Vitest project, with no database
 * and no environment.
 */

/**
 * The five stages, from the one nearest the source text to the one furthest
 * from it. Lowercase members rather than `SCREAMING_SNAKE`: this union mirrors
 * no Prisma enum — there is no obsolescence column and there is not going to be
 * one — so CLAUDE.md §4.2's default spelling applies.
 */
export const DOWNSTREAM_STAGES = [
  "analysis", // analyse du texte source
  "direction", // directions romanesques
  "bible", // bible narrative
  "outline", // plan
  "chapters", // chapitres
] as const;

export type DownstreamStage = (typeof DOWNSTREAM_STAGES)[number];

export function isDownstreamStage(value: string): value is DownstreamStage {
  return (DOWNSTREAM_STAGES as readonly string[]).includes(value);
}

/**
 * Where a stage sits in the chain — its own index, which is also the count of
 * stages upstream of it.
 */
export function downstreamStageRank(stage: DownstreamStage): number {
  return DOWNSTREAM_STAGES.indexOf(stage);
}
