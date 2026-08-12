/**
 * What each mission writes into, so two generations never write into it at once
 * (CAL-067).
 *
 * The specification's rule is about the *novel*, not about a row: two
 * generations must never run on the same chapter, the same bible or the same
 * plan. `Generation.targetId` alone cannot answer that — it names what the
 * mission was asked about, and two missions asked about different things
 * routinely write into the same place. `CREATE_CHARACTER_SHEET` names a
 * character and `EXTRACT_FACTS` names a chapter, and both write the bible.
 *
 * So a *write target* is a pair: the kind of thing a mission writes into, and
 * which one. Four kinds are project singletons — a project has one analysis, one
 * set of directions, one bible, one outline, one audit — and their `targetId` is
 * ignored, because there is only ever one of them to collide over. Three are
 * keyed by `targetId`, because a project has many chapters, many parts and many
 * directions, and two of them may safely be written at once.
 *
 * **The lock this table feeds is derived, never stored.** A target is held by a
 * generation that is `RUNNING` on it, and by nothing else — there is no lock
 * table, no lock column and no second expiry timer. Three consequences, and each
 * is why it is built this way:
 *
 * - **It expires on its own when a worker dies.** A `RUNNING` generation whose
 *   worker is gone loses its attempt to `GenerationAttempt.leaseExpiresAt` and
 *   is returned to `QUEUED` by `requeueOrphanedGenerations`. A stored lock would
 *   need a TTL of its own, and a TTL that can disagree with the lease is a lock
 *   that either outlives the work or dies under it.
 * - **Holding the target and being allowed to write are the same condition.** A
 *   generation only ever appends inside `completeGenerationAttempt`, which
 *   applies to an attempt that is still `RUNNING`; an attempt reclaimed under a
 *   zombie worker is answered `already-completed` and its result is dropped
 *   (`superseded`). Keeping the two conditions one condition is what makes *no
 *   generation overwrites anything* provable rather than promised.
 * - **The check is already atomic.** Every claim holds `FOR UPDATE OF g, u`
 *   since CAL-065, and two generations on one chapter necessarily share an
 *   owner — so two claims for one target are serialised by a lock that already
 *   exists, exactly as the concurrency count is.
 *
 * This module cannot import `@calepin/ai` (CLAUDE.md §3.2), so the table is
 * stated here against the Prisma enum and `write-target.test.ts` pins it to
 * that enum — the same arrangement `queue/mission-routing.ts` already uses.
 */

import type { $Enums } from "@prisma/client";

type Mission = $Enums.GenerationMission;

/**
 * The seven places a mission can write, in the order the novel is built in.
 *
 * `audit` is here so `CHECK_COHERENCE` has a target of its own rather than a
 * carve-out: it reads the novel and writes `QualityIssue` rows, so it must not
 * hold a chapter — but two audits of one project would arbitrate the same
 * findings twice, and they are excluded from each other.
 */
export const GENERATION_WRITE_TARGET_KINDS = [
  "analysis",
  "directions",
  "direction",
  "bible",
  "outline",
  "chapter",
  "part",
  "audit",
] as const;

export type GenerationWriteTargetKind = (typeof GENERATION_WRITE_TARGET_KINDS)[number];

/**
 * Every mission, mapped to the one thing it writes into.
 *
 * Read off what each mission produces, per the glossary (CLAUDE.md §4.3), not
 * off what it is named after: `EXTRACT_FACTS` is asked about a chapter and
 * writes `CanonFact` rows into the bible, `SUMMARIZE_CHAPTER` is asked about a
 * chapter and writes a `ChapterSummaryRevision` under it.
 */
export const MISSION_WRITE_TARGET_KIND: Readonly<Record<Mission, GenerationWriteTargetKind>> = {
  // All four write the project's one analysis — the diagnostic's sections,
  // the cliché findings, the potential assessment and the redo of a single
  // section land in the same document, so they exclude each other. The fourth
  // is the one that makes the exclusion earn its keep: a regeneration appends
  // a revision to a section the whole-analysis mission is about to rewrite,
  // and whichever of the two landed second would be the answer nobody asked
  // for.
  ANALYZE_SOURCE_TEXT: "analysis",
  DETECT_CLICHE_RISKS: "analysis",
  ASSESS_NOVEL_POTENTIAL: "analysis",
  REGENERATE_ANALYSIS_SECTION: "analysis",

  // Three write the project's set of directions, so they exclude each other —
  // and a replacement excludes a *second* replacement, which is the exclusion
  // that earns its keep: two of them running at once would each be told to
  // avoid the engines the other is about to create, and could land on one
  // engine twice. A combination (CAL-084) is in the same position from the
  // other side: its dominant-engine gate reads the source engines, and a
  // proposal or replacement landing mid-flight would change the set it was
  // judged against. `EVALUATE_DIRECTION` is the odd one out on purpose: it
  // writes a critique under one direction, so two directions may be judged at
  // the same time.
  PROPOSE_DIRECTIONS: "directions",
  REPLACE_DIRECTION: "directions",
  COMBINE_DIRECTIONS: "directions",
  EVALUATE_DIRECTION: "direction",

  // All four write the bible: the identity section, the style section, a
  // character sheet and a canon fact are sections of one document, and
  // CAL-138's conflict detection reads the whole of it. The identity is the
  // one that earns the exclusion twice over — CAL-090's sheets are written
  // *from* it, so a sheet generated while the identity is being rewritten
  // would be built on a section nobody ended up keeping — and the style is in
  // the same position one section over: it is written against the identity,
  // and a style generated while the identity moves would be tuned to a
  // section nobody kept.
  DEFINE_NOVEL_IDENTITY: "bible",
  DEFINE_STYLE: "bible",
  CREATE_CHARACTER_SHEET: "bible",
  RELATE_CHARACTERS: "bible",
  DEFINE_WORLD: "bible",
  EXTRACT_FACTS: "bible",

  BUILD_CHAPTER_OUTLINE: "outline",

  // The three that write under one chapter — its text, twice over, and its
  // pair of summaries.
  WRITE_SCENE: "chapter",
  FIX_ISSUE: "chapter",
  SUMMARIZE_CHAPTER: "chapter",

  SUMMARIZE_PART: "part",

  CHECK_COHERENCE: "audit",
};

/**
 * The kinds a project has exactly one of, whatever a generation's `targetId`
 * says.
 *
 * The distinction is the whole point of the table: a project has one bible, so
 * two missions writing into it collide even when they name different rows —
 * while two chapters of one novel may be written at once, which is what
 * `claimGenerationAttempt`'s own lock has always been careful to allow.
 */
export const PROJECT_WIDE_WRITE_TARGET_KINDS = [
  "analysis",
  "directions",
  "bible",
  "outline",
  "audit",
] as const satisfies readonly GenerationWriteTargetKind[];

const PROJECT_WIDE = new Set<GenerationWriteTargetKind>(PROJECT_WIDE_WRITE_TARGET_KINDS);

/** Whether a project has exactly one of these, so `targetId` cannot separate two. */
export function isProjectWideWriteTarget(kind: GenerationWriteTargetKind): boolean {
  return PROJECT_WIDE.has(kind);
}

/** What one generation writes into — the pair a lock is taken on. */
export interface GenerationWriteTarget {
  readonly kind: GenerationWriteTargetKind;
  /**
   * Which one, for a kind a project has several of. `null` for a project
   * singleton, and `null` for a targeted mission whose row carries no
   * `targetId` — which is a defect upstream, and the conservative reading of
   * one: a null target excludes every other generation of its kind rather than
   * quietly excluding none.
   */
  readonly id: string | null;
}

/** The target a generation writes into, from the two columns that decide it. */
export function generationWriteTarget(
  mission: Mission,
  targetId: string | null,
): GenerationWriteTarget {
  const kind = MISSION_WRITE_TARGET_KIND[mission];

  return { kind, id: isProjectWideWriteTarget(kind) ? null : targetId };
}

/** Every mission that writes into this kind — the `IN` list a lock query needs. */
export function missionsWritingTo(kind: GenerationWriteTargetKind): Mission[] {
  return (Object.keys(MISSION_WRITE_TARGET_KIND) as Mission[]).filter(
    (mission) => MISSION_WRITE_TARGET_KIND[mission] === kind,
  );
}

/** Whether two generations of one project would write into the same place. */
export function sameWriteTarget(a: GenerationWriteTarget, b: GenerationWriteTarget): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/**
 * How soon a generation refused for a held write target is offered to the
 * reconciliation sweep again.
 *
 * `CAPACITY_RETRY_DELAY_MS`'s twin (CAL-065), and a separate number because it
 * is a separate decision: nothing failed and no attempt was opened, so nothing
 * else would ever schedule the row, and without a deadline it would sit out the
 * sweep's full staleness window before being reconsidered. Longer than the
 * capacity delay because a held target is held for the length of a whole
 * mission — minutes, not the moment it takes another generation to finish —
 * while still comfortably under `GENERATION_STALE_AFTER_MS`, which is the only
 * thing either number has to beat. The sweep's own minute is the real
 * granularity whatever this says.
 */
export const WRITE_TARGET_RETRY_DELAY_MS = 30_000;
