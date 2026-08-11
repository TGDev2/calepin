/**
 * The prompt registry (CAL-053) — **every prompt this product has ever sent.**
 *
 * One entry per prompt id, holding its versions in the order they shipped. The
 * current version is the last one; the earlier ones stay, because a
 * `GenerationAttempt` records a version number and a number pointing at text
 * that was edited in place attributes nothing. It is the append-only shape the
 * glossary already gives `SourceTextVersion`, and it is what makes
 * `comparePromptVersions` answerable at all.
 *
 * **Prompts are code, not rows.** The fork was decided here: a `Prompt` table
 * would let the text that produces the novel change without review, drift
 * between environments, and need a migration to ship a wording fix. Being code,
 * a prompt change is a diff a human reads, arrives with the commit that
 * explains it, and is reachable forever from the version an attempt recorded.
 * The mission registry (CAL-051) is code for the same reasons, and ADR-001 puts
 * the two side by side in this layer.
 *
 * **What the registry does not hold**: what goes *into* a variable. Composing
 * the context — which bible sections, which facts, which excerpts, and what to
 * drop when the budget is reached — is CAL-054's, and §5.8 is the rule it has
 * to satisfy. This file declares the holes; the composer fills them.
 */

import { promptNotRegistered } from "../failures";
import type { MissionId } from "../missions";
import { BENCH_COMPARE_OUTPUTS_PROMPTS } from "./bench/judge-comparison";
import { BENCH_REVIEW_OUTPUT_PROMPTS } from "./bench/judge-review";
import { BENCH_SYNTHESIZE_COMPARISON_PROMPTS } from "./bench/judge-synthesis";
import { ANALYZE_SOURCE_TEXT_PROMPTS } from "./missions/analyze-source-text";
import { BUILD_CHAPTER_OUTLINE_PROMPTS } from "./missions/build-chapter-outline";
import { CHECK_COHERENCE_PROMPTS } from "./missions/check-coherence";
import { CREATE_CHARACTER_SHEET_PROMPTS } from "./missions/create-character-sheet";
import { DETECT_CLICHE_RISKS_PROMPTS } from "./missions/detect-cliche-risks";
import { EVALUATE_DIRECTION_PROMPTS } from "./missions/evaluate-direction";
import { EXTRACT_FACTS_PROMPTS } from "./missions/extract-facts";
import { FIX_ISSUE_PROMPTS } from "./missions/fix-issue";
import { PROPOSE_DIRECTIONS_PROMPTS } from "./missions/propose-directions";
import { SUMMARIZE_CHAPTER_PROMPTS } from "./missions/summarize-chapter";
import { SUMMARIZE_PART_PROMPTS } from "./missions/summarize-part";
import { WRITE_SCENE_PROMPTS } from "./missions/write-scene";
import { REPAIR_STRUCTURED_OUTPUT_PROMPTS } from "./repair";
import type { PromptDefinition, PromptId } from "./types";

/** At least one version, oldest first — a prompt with no version is not a prompt. */
export type PromptVersions = readonly [PromptDefinition, ...PromptDefinition[]];

export type PromptRegistry = Readonly<Record<PromptId, PromptVersions>>;

export const PROMPT_REGISTRY = {
  "analyze-source-text": ANALYZE_SOURCE_TEXT_PROMPTS,
  "detect-cliche-risks": DETECT_CLICHE_RISKS_PROMPTS,
  "propose-directions": PROPOSE_DIRECTIONS_PROMPTS,
  "evaluate-direction": EVALUATE_DIRECTION_PROMPTS,
  "create-character-sheet": CREATE_CHARACTER_SHEET_PROMPTS,
  "build-chapter-outline": BUILD_CHAPTER_OUTLINE_PROMPTS,
  "write-scene": WRITE_SCENE_PROMPTS,
  "extract-facts": EXTRACT_FACTS_PROMPTS,
  "check-coherence": CHECK_COHERENCE_PROMPTS,
  "fix-issue": FIX_ISSUE_PROMPTS,
  "summarize-chapter": SUMMARIZE_CHAPTER_PROMPTS,
  "summarize-part": SUMMARIZE_PART_PROMPTS,
  "repair-structured-output": REPAIR_STRUCTURED_OUTPUT_PROMPTS,
  "bench-review-output": BENCH_REVIEW_OUTPUT_PROMPTS,
  "bench-compare-outputs": BENCH_COMPARE_OUTPUTS_PROMPTS,
  "bench-synthesize-comparison": BENCH_SYNTHESIZE_COMPARISON_PROMPTS,
} as const satisfies PromptRegistry;

type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer L] ? L : never;

/**
 * The type of the version a call site will actually render.
 *
 * Resolved from the tuple rather than widened to `PromptDefinition`, so
 * `renderPrompt` demands exactly the variables the current version declares.
 * Shipping a version that adds one then breaks every call site that does not
 * supply it — at compile time, which is the point of declaring them.
 */
export type CurrentPrompt<Id extends PromptId> = Last<(typeof PROMPT_REGISTRY)[Id]>;

export function promptVersions(id: PromptId): PromptVersions {
  return PROMPT_REGISTRY[id];
}

export function currentPrompt<Id extends PromptId>(id: Id): CurrentPrompt<Id> {
  const versions = PROMPT_REGISTRY[id];

  // The cast restates the tuple's own shape, which `registry.test.ts` pins: the
  // last element is the highest version, because versions are appended.
  return versions[versions.length - 1] as CurrentPrompt<Id>;
}

/**
 * One shipped version, by number — how a comparison and an audit reach the text
 * an attempt recorded months ago.
 */
export function promptAtVersion(id: PromptId, version: number): PromptDefinition {
  const found = PROMPT_REGISTRY[id].find((definition) => definition.version === version);

  if (found === undefined) {
    throw promptNotRegistered(`${id}@${version}`);
  }

  return found;
}

const MISSION_PROMPT_IDS: ReadonlyMap<MissionId, PromptId> = new Map(
  Object.keys(PROMPT_REGISTRY).flatMap((key) => {
    const id = key as PromptId;
    const { scope } = currentPrompt(id);

    return scope.kind === "mission" ? [[scope.missionId, id] as const] : [];
  }),
);

/**
 * The current prompt serving a mission.
 *
 * Read off `scope`, never off the spelling of the id: the two match today
 * because each mission has exactly one prompt, and the day a second one exists
 * the scope is still what says which mission it serves.
 * `registry.test.ts` pins the mapping total over `MissionId` and one-to-one.
 */
export function missionPrompt(missionId: MissionId): PromptDefinition {
  const found = MISSION_PROMPT_IDS.get(missionId);

  if (found === undefined) {
    throw promptNotRegistered(missionId);
  }

  return currentPrompt(found);
}
