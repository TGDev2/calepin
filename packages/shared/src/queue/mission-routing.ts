/**
 * Which queue and which priority each mission gets (CAL-066).
 *
 * Both tables are total over `GenerationMission` — `mission-routing.test.ts`
 * reads `prisma/schema.prisma`'s enum the same way `@calepin/ai`'s
 * `missions.test.ts` does and fails if a mission is added here without a
 * routing decision, or the other way round.
 *
 * **The grouping is read off `@calepin/ai/mission-registry.ts`'s own data**,
 * not invented: `EXTRACT_FACTS`, `SUMMARIZE_CHAPTER` and `SUMMARIZE_PART` are
 * the only three on Sonnet at `low` effort with `expectedDurationMs` at or
 * under a minute — the fast lane. The audit lane holds what the glossary names
 * a *contrôle de cohérence*: `CHECK_COHERENCE` over the written chapters, and
 * since CAL-099 `DETECT_BIBLE_CONTRADICTIONS` over the bible. Both read a whole
 * project to report on it rather than to add to it, and both must be able to
 * run while the author is doing something else — which is the whole reason the
 * lane exists, and why a second member does not weaken it: they write
 * `QualityIssue` rows and hold the same `audit` write target, so the claim
 * already serialises them against each other. Everything else is Opus at
 * medium effort or above, 90 to 600
 * seconds — including `FIX_ISSUE`, whose own registry comment says it "stays
 * where `write-scene` is" rather than beside `extract-facts`.
 *
 * This module cannot import `@calepin/ai` (CLAUDE.md §3.2: `@calepin/shared`
 * imports nothing), so the grouping is restated here against the Prisma
 * enum, exactly as `generation.ts` already restates `GenerationMission`
 * itself under this package's own name.
 */

import type { $Enums } from "@prisma/client";

import { type DownstreamStage, downstreamStageRank } from "../obsolescence";
import type { GenerationQueueName } from "./queues";

type Mission = $Enums.GenerationMission;

/** Every mission, routed to exactly one of the three generation queues. */
export const MISSION_QUEUE: Readonly<Record<Mission, GenerationQueueName>> = {
  EXTRACT_FACTS: "generation-fast",
  SUMMARIZE_CHAPTER: "generation-fast",
  SUMMARIZE_PART: "generation-fast",

  CHECK_COHERENCE: "generation-audit",
  DETECT_BIBLE_CONTRADICTIONS: "generation-audit",

  ANALYZE_SOURCE_TEXT: "generation-slow",
  DETECT_CLICHE_RISKS: "generation-slow",
  ASSESS_NOVEL_POTENTIAL: "generation-slow",
  REGENERATE_ANALYSIS_SECTION: "generation-slow",
  PROPOSE_DIRECTIONS: "generation-slow",
  REPLACE_DIRECTION: "generation-slow",
  EVALUATE_DIRECTION: "generation-slow",
  COMBINE_DIRECTIONS: "generation-slow",
  DEFINE_NOVEL_IDENTITY: "generation-slow",
  DEFINE_STYLE: "generation-slow",
  CREATE_CHARACTER_SHEET: "generation-slow",
  RELATE_CHARACTERS: "generation-slow",
  DEFINE_WORLD: "generation-slow",
  BUILD_TIMELINE: "generation-slow",
  EXTRACT_INITIAL_FACTS: "generation-slow",
  BUILD_CHAPTER_OUTLINE: "generation-slow",
  WRITE_SCENE: "generation-slow",
  FIX_ISSUE: "generation-slow",
};

/**
 * Where a `generation-slow` mission sits in the downstream chain
 * (`@calepin/shared/obsolescence`) — the real, already-implemented
 * dependency graph a source-text edit runs down. A mission absent here has
 * no stage of its own (`generation-fast`'s three enrich derived state after
 * a chapter rather than feeding the chain, and `CHECK_COHERENCE` is excluded
 * from `DOWNSTREAM_STAGES` by that module's own doc comment — "a coherence
 * audit is a reading of the chapters rather than a stage built on them").
 */
const MISSION_STAGE: Partial<Record<Mission, DownstreamStage>> = {
  ANALYZE_SOURCE_TEXT: "analysis",
  DETECT_CLICHE_RISKS: "analysis",
  ASSESS_NOVEL_POTENTIAL: "analysis",
  REGENERATE_ANALYSIS_SECTION: "analysis",
  PROPOSE_DIRECTIONS: "direction",
  REPLACE_DIRECTION: "direction",
  EVALUATE_DIRECTION: "direction",
  COMBINE_DIRECTIONS: "direction",
  DEFINE_NOVEL_IDENTITY: "bible",
  DEFINE_STYLE: "bible",
  CREATE_CHARACTER_SHEET: "bible",
  RELATE_CHARACTERS: "bible",
  DEFINE_WORLD: "bible",
  BUILD_TIMELINE: "bible",
  EXTRACT_INITIAL_FACTS: "bible",
  BUILD_CHAPTER_OUTLINE: "outline",
  WRITE_SCENE: "chapters",
  FIX_ISSUE: "chapters",
};

/**
 * BullMQ job priority per mission — 1 is highest, and only orders jobs
 * *waiting on the same queue*: it has no cross-queue effect, so it changes
 * nothing about `generation-fast` never sitting behind `generation-slow` —
 * the queue split itself already guarantees that. What it does do is order
 * `generation-slow`'s fourteen missions against each other when more than one
 * is waiting on that queue's own limited concurrency, from
 * `downstreamStageRank` (a job upstream in the chain outranks one that
 * depends on it). `generation-fast`'s three and `generation-audit`'s one get
 * a uniform priority: nothing in the registry ranks `extract-facts` over
 * `summarize-chapter`, so they are declared equally urgent rather than given
 * an invented split.
 */
export const MISSION_PRIORITY: Readonly<Record<Mission, number>> = Object.fromEntries(
  (Object.keys(MISSION_QUEUE) as Mission[]).map((mission) => {
    const stage = MISSION_STAGE[mission];

    return [mission, stage === undefined ? 1 : downstreamStageRank(stage) + 1];
  }),
) as Record<Mission, number>;
