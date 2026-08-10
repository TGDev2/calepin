/**
 * What the context composer is given, and what it reports (CAL-054).
 *
 * Every candidate here is **structural**: an id, a distance, a priority, a
 * link — plus the text it stands for, which the composer carries but never
 * reads. Deciding what a statement *means* is the domain's; deciding what fits
 * under the mission's budget is this layer's (§5.7, ADR-001). The caller — a
 * domain function handed its rows by the repository — resolves ids and builds
 * the candidates; the composer selects, degrades and renders.
 */

import type { MissionId } from "../missions";
import type { PromptId } from "../prompts";

/**
 * A canon fact offered to the composition — *fait canonique concerné*.
 *
 * The two selection signals mirror the schema (CAL-019): `isNamedByOutline` is
 * the `ChapterOutlineFact` link, and `subjectIds` are the `CanonFactSubject`
 * rows — the characters and places the fact concerns. Both are id links chosen
 * without reading a statement, which is what keeps the policy structural.
 */
export interface CanonFactCandidate {
  readonly id: string;
  /** The fact's always-affirmative statement — literary content, never logged. */
  readonly statement: string;
  /** True when a `ChapterOutlineFact` row names this fact for the target. */
  readonly isNamedByOutline: boolean;
  /** The `Character` and `Place` ids the fact concerns. */
  readonly subjectIds: readonly string[];
}

/**
 * One preceding chapter, represented by its summaries — never by its text.
 *
 * `distance` is structural recency: 1 is the chapter immediately before the
 * target. The full text of the chapter has no field here, deliberately: a
 * chapter reaches a writing context as a summary or as a bounded excerpt, and
 * there is nothing to pass its text into.
 */
export interface PrecedingChapterSummary {
  readonly id: string;
  /** 1 = immediately preceding the target chapter; always ≥ 1. */
  readonly distance: number;
  /** The chapter's brief summary — *résumé court*. */
  readonly briefSummary: string;
  /** The detailed one — *résumé détaillé* — when a summarize pass produced it. */
  readonly detailedSummary?: string;
}

/**
 * A verbatim earlier passage continuity requires — *extrait nécessaire*.
 *
 * `priority` is caller-assigned, 1 being the most necessary; the composer
 * keeps the top few and drops from the bottom when the budget bites. The
 * per-item ceiling is what makes "an excerpt" a bounded thing rather than a
 * name a whole chapter could travel under.
 */
export interface ContinuityExcerptCandidate {
  readonly id: string;
  /** How many chapters back the passage sits; always ≥ 1. */
  readonly distance: number;
  /** 1 = most necessary. Ties break toward the nearer chapter. */
  readonly priority: number;
  readonly text: string;
}

/**
 * Everything `composeSceneContext` needs, gathered by the caller.
 *
 * `language`, `bibleStyle` and `chapterOutline` must be non-empty — an empty
 * required section is a call-site bug and `renderPrompt` throws on it. The
 * lists may all be empty: chapter 1 has no preceding anything.
 */
export interface SceneContextInput {
  /** The project's writing language, e.g. "français". */
  readonly language: string;
  /** The bible's style section — the one bible section this mission needs. */
  readonly bibleStyle: string;
  /** The plan of the chapter being written, already phrased by the domain. */
  readonly chapterOutline: string;
  readonly targetWordCount: number;
  /** The author's own instructions for this chapter — *demande utilisateur*. */
  readonly authorInstructions: readonly string[];
  /** One freedom-level clause per dimension, for the writing stage. */
  readonly freedomConstraints: readonly string[];
  /** The `Character` and `Place` ids the target outline names. */
  readonly outlineEntityIds: readonly string[];
  readonly canonFacts: readonly CanonFactCandidate[];
  readonly precedingChapters: readonly PrecedingChapterSummary[];
  readonly continuityExcerpts: readonly ContinuityExcerptCandidate[];
}

/**
 * The §9-safe projection of a composition: counts, identifiers and token
 * numbers only — every field is loggable, none can hold prose. A report exists
 * only for a context that fits; a failed composition returns an error and no
 * report.
 */
export interface ContextCompositionReport {
  readonly missionId: MissionId;
  readonly promptId: PromptId;
  readonly promptVersion: number;
  /** The mission's declared ceiling, from the registry. */
  readonly budgetTokens: number;
  /** The conservative estimate of the rendered prompt, system included. */
  readonly estimatedTokens: number;
  /** Ladder steps walked before the estimate fit. 0 = nothing degraded. */
  readonly degradationStepsApplied: number;
  readonly facts: { readonly offered: number; readonly selected: number };
  readonly summaries: {
    readonly offered: number;
    readonly detailed: number;
    readonly brief: number;
    readonly dropped: number;
  };
  readonly excerpts: { readonly offered: number; readonly selected: number };
}
