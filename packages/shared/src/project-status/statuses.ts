/**
 * The ten project statuses of the specification, in the order a project travels
 * through them (CAL-034).
 *
 * The order is the design, not a presentation choice: it is what "one step
 * forward" and "any step back" in `./transitions` mean, and what the prefix
 * derivation in `./progress` walks. Reordering this list reorders the state
 * machine.
 *
 * **The members are spelled as the schema spells them.** CLAUDE.md §4.2 asks for
 * lowercase members in a shared literal union, and every union this package owns
 * follows it — `ERROR_CATEGORIES`, `GENERATION_STATUSES`. This one is different
 * in kind: `ProjectStatus` is a Prisma enum CAL-012 declared, and this list
 * mirrors *it* rather than the other way round. A lowercase spelling here would
 * buy nothing and cost a translation at every boundary — the column, the `where`
 * clause, the French label table in `apps/web`. `LIVE_GENERATION_STATUSES` in
 * `../account/inventory.ts` already took that side. `prisma/schema.test.ts` pins
 * the two lists against each other, so a member added to one and not the other
 * fails there.
 *
 * **This file imports nothing**, for the reason `../repository/owned-models.ts`
 * and `../audit/models.ts` import nothing: the whole state machine has to stay
 * runnable by the `unit` Vitest project, with no database and no generated
 * client — and `apps/web` has to be able to read it without coming near the
 * data-access seam (CLAUDE.md §3.5).
 */

export const PROJECT_STATUSES = [
  "DRAFT", // brouillon
  "ANALYSIS_IN_PROGRESS", // analyse en cours
  "DIRECTION_TO_CHOOSE", // direction à choisir
  "BIBLE_TO_VALIDATE", // bible à valider
  "OUTLINE_IN_PROGRESS", // plan en construction
  "WRITING_IN_PROGRESS", // rédaction en cours
  "REVISION", // révision
  "COMPLETED", // terminé
  "PUBLISHED", // publié
  "ARCHIVED", // archivé
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * The nine statuses that name a place in the novel's progress, `ARCHIVED`
 * excluded.
 *
 * Archiving is not a stage: it is orthogonal to how far the novel has come, and
 * it is the one status no amount of narrative evidence can produce. It is
 * therefore outside the chain the transition rule and the derivation both walk,
 * and it gets its own edges in `./transitions`.
 */
export const PROJECT_STAGE_STATUSES = PROJECT_STATUSES.filter(
  (status): status is Exclude<ProjectStatus, "ARCHIVED"> => status !== "ARCHIVED",
);

export type ProjectStage = (typeof PROJECT_STAGE_STATUSES)[number];

/**
 * How far along the chain a status sits — the number the transition rule
 * compares.
 *
 * `ARCHIVED` has no rank. Asking for one is a caller that mistook it for a
 * stage, so the type refuses the question rather than answering with a number
 * that would place archiving after publication.
 */
export function projectStageRank(stage: ProjectStage): number {
  return PROJECT_STAGE_STATUSES.indexOf(stage);
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

export function isProjectStage(status: ProjectStatus): status is ProjectStage {
  return status !== "ARCHIVED";
}
