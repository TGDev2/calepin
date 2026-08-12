/**
 * Which bible elements each mission would rebuild (CAL-095).
 *
 * `MISSION_WRITE_TARGET_KIND` next door answers *where* a mission writes, at
 * the granularity two generations contend over — one bible, one chapter. That
 * granularity is deliberately coarse, and it is too coarse for a lock: every
 * bible mission writes "the bible", so a lock read off that table would make
 * one locked character stop the chronology.
 *
 * So this is the same table one level finer. The rule it states:
 *
 * > **A mission is in scope for a model when it is asked to (re)build the
 * > project's content of that model.**
 *
 * The seven bible missions each rebuild their own section, so each names its
 * models. `EXTRACT_FACTS` is the one bible mission deliberately left empty, and
 * the omission is the load-bearing part of the table: it proposes `PROPOSED`
 * rows from one written chapter for the author to arbitrate (CAL-128), it
 * rewrites nothing, and putting `CanonFact` here would stop the entire writing
 * loop the moment an author locked a single fact. That is the *detector that
 * cries wolf* failure CAL-093 and CAL-094 each refused in turn — and the
 * specification's own answer for a proposed fact contradicting a locked one is
 * an alert after extraction, not a gate before it.
 *
 * The fourteen non-bible missions name nothing because a lock is a bible
 * element and they write elsewhere. That is not an assumption: the test pins
 * every entry against `MISSION_WRITE_TARGET_KIND`, so a mission writing into
 * the bible with an empty scope has to say so on purpose.
 *
 * This module cannot import `@calepin/ai` (CLAUDE.md §3.2), so the table is
 * stated against the Prisma enum and `scope.test.ts` pins it to that enum —
 * `write-target.ts`'s own arrangement, for its own reason.
 */

import type { $Enums } from "@prisma/client";

import { type BibleLockableModel } from "./models";

type Mission = $Enums.GenerationMission;

/**
 * Every mission, mapped to the bible models it would rebuild.
 *
 * Read off what each mission's answer *replaces*, not off what it is named
 * after. `CREATE_CHARACTER_SHEET` names `Relationship` because CAL-090's
 * contract carries the sheet's edges, and `DEFINE_WORLD` names three models
 * because CAL-092's answer becomes a `BibleWorld` row plus `Place` and
 * `WorldRule` rows.
 */
export const MISSION_LOCK_SCOPE: Readonly<Record<Mission, readonly BibleLockableModel[]>> = {
  // The analysis and the directions are upstream of the bible: nothing they
  // write is a bible element, and nothing they read can be locked.
  ANALYZE_SOURCE_TEXT: [],
  DETECT_CLICHE_RISKS: [],
  ASSESS_NOVEL_POTENTIAL: [],
  REGENERATE_ANALYSIS_SECTION: [],
  PROPOSE_DIRECTIONS: [],
  REPLACE_DIRECTION: [],
  COMBINE_DIRECTIONS: [],
  EVALUATE_DIRECTION: [],

  // The seven that build the bible, each over the section it owns.
  DEFINE_NOVEL_IDENTITY: ["BibleIdentity"],
  DEFINE_STYLE: ["BibleStyle"],
  // Two, because CAL-090's contract carries `relationships` beside the fifteen
  // sheet columns — the sheet declares the edges leaving its own character, and
  // `resolveCharacterSheet` turns them into rows.
  CREATE_CHARACTER_SHEET: ["Character", "Relationship"],
  RELATE_CHARACTERS: ["Relationship"],
  // Three, because CAL-092's nine fields become one `BibleWorld` row plus the
  // places and the rules — `resolveWorldRules` writes `isSupernatural` from
  // which array an entry came out of, and both arrays land in `world_rules`.
  DEFINE_WORLD: ["BibleWorld", "Place", "WorldRule"],
  BUILD_TIMELINE: ["TimelineEvent"],
  // The initial pass opens the canon: it is asked for the project's whole set
  // of facts, so re-running it over a canon the author has settled is
  // re-deciding what they settled.
  EXTRACT_INITIAL_FACTS: ["CanonFact"],

  // The one bible mission that builds nothing. See the module header: it
  // proposes rows the author arbitrates, and blocking it would turn one locked
  // fact into a stopped novel.
  EXTRACT_FACTS: [],

  // The same reasoning one epic later: CAL-099's contradiction pass builds no
  // section either. It reads the whole bible and proposes findings the author
  // arbitrates, so naming a model here would stop the coherence check at the
  // first locked fact — and a locked fact is exactly the kind that ends up in a
  // contradiction worth reporting.
  DETECT_BIBLE_CONTRADICTIONS: [],

  // The plan missions read the reference bible (CAL-100's savepoint) and
  // rebuild no bible section: a part is not a bible element, and the threads
  // the split declares wait for chapters to exist as rows (CAL-102).
  SPLIT_INTO_PARTS: [],
  BUILD_CHAPTER_OUTLINE: [],
  SPLIT_CHAPTER_OUTLINE: [],
  WRITE_SCENE: [],
  FIX_ISSUE: [],
  SUMMARIZE_CHAPTER: [],
  SUMMARIZE_PART: [],
  CHECK_COHERENCE: [],
};

/**
 * The missions whose scope is narrowed to the character they name.
 *
 * `isProjectWideWriteTarget`'s distinction, one level down and with the answer
 * reversed: a write target is project-wide by default because a project has one
 * bible, while a lock is project-wide by default because a section is rebuilt
 * whole. `CREATE_CHARACTER_SHEET` is the exception on both counts — it rebuilds
 * exactly the sheet `Generation.targetId` names, and its edges, so another
 * character's lock must not stop it.
 *
 * A set rather than a field on every entry, so the twenty-one missions that do
 * not narrow say nothing about narrowing.
 */
export const MISSIONS_NARROWED_TO_TARGET = [
  "CREATE_CHARACTER_SHEET",
] as const satisfies readonly Mission[];

const NARROWED = new Set<Mission>(MISSIONS_NARROWED_TO_TARGET);

/** Whether this mission rebuilds only what its `targetId` names. */
export function isMissionNarrowedToTarget(mission: Mission): boolean {
  return NARROWED.has(mission);
}

/** The bible models this mission would rebuild — the read a gate has to make. */
export function missionLockScope(mission: Mission): readonly BibleLockableModel[] {
  return MISSION_LOCK_SCOPE[mission];
}
