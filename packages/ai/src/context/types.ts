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
 * One preceding part, represented by its summary — the coarse level of the
 * memory (CAL-055).
 *
 * `distance` is structural recency in *parts*: 1 is the part immediately before
 * the target chapter's own. Only parts entirely behind the target are offered;
 * the part the chapter is being written into is represented by its chapters,
 * which are all the composer has of it and all it should have.
 *
 * There is no `briefSummary`/`detailedSummary` pair here on purpose. A part has
 * one summary because it is already the compressed level: a second, longer one
 * would be the chapter summaries again, at the price of the thing they were
 * compressed to avoid.
 */
export interface PartSummary {
  readonly id: string;
  /** 1 = the part immediately before the target chapter's own; always ≥ 1. */
  readonly distance: number;
  readonly summary: string;
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
  /**
   * The bible's relationship graph, already phrased by the domain
   * (`describeRelationshipGraph` in `@calepin/bible`) — one line per directed
   * edge, plus one naming what a pair left unanswered (CAL-091).
   *
   * Carried whole and **never degraded**, for `canonFacts`' reason: a tie is
   * canon, and dropping the line that says B never learned what A knows is
   * how a scene comes to have B act on it. Lines rather than a block so each
   * one is bounded on its own by `CONTEXT_ITEM_CEILINGS.characterRelation`.
   */
  readonly characterRelations: readonly string[];
  readonly canonFacts: readonly CanonFactCandidate[];
  /** The summaries of the parts entirely behind the target chapter (CAL-055). */
  readonly precedingParts: readonly PartSummary[];
  readonly precedingChapters: readonly PrecedingChapterSummary[];
  readonly continuityExcerpts: readonly ContinuityExcerptCandidate[];
}

/**
 * What `composeChapterSummaryContext` needs (CAL-055).
 *
 * The word targets are the domain's — `@calepin/manuscript` owns them, because
 * they are also the bound its schema validates the answer against, and one
 * number stated twice is one number that will disagree with itself. This layer
 * renders what it is handed.
 */
export interface ChapterSummaryContextInput {
  readonly language: string;
  /** The revision being summarised, in full: it is the subject, not context. */
  readonly chapterText: string;
  readonly briefWordTarget: number;
  readonly detailedWordTarget: number;
}

/** One already-summarised chapter, offered to the part composition. */
export interface PartSummaryChapter {
  readonly id: string;
  readonly briefSummary: string;
  readonly detailedSummary?: string;
}

/**
 * What `composePartSummaryContext` needs (CAL-055).
 *
 * `chapters` arrives in reading order and stays in it: a part's arc is the
 * order of what happened, and sorting here would be this layer deciding
 * something narrative (§5.7). No chapter text has a field.
 */
export interface PartSummaryContextInput {
  readonly language: string;
  readonly partTitle: string;
  readonly wordTarget: number;
  /** The part's planning attributes, already phrased; empty when it has none. */
  readonly plannedArc: readonly string[];
  readonly chapters: readonly PartSummaryChapter[];
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
  /**
   * Relationship lines carried. One number, not a pair: they are not
   * degradable, so offered and selected are the same by construction —
   * `partSummaries`' arrangement.
   */
  readonly characterRelations: number;
  /**
   * Part summaries carried. There is no `dropped` counterpart: they are not
   * degradable, so offered and selected are the same number by construction —
   * stated as one field rather than as two that can never differ.
   */
  readonly partSummaries: number;
  readonly summaries: {
    readonly offered: number;
    readonly detailed: number;
    readonly brief: number;
    readonly dropped: number;
  };
  readonly excerpts: { readonly offered: number; readonly selected: number };
}
