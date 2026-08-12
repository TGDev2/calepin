/**
 * The duplication plan (CAL-035) — what a deep copy of a project copies, in
 * what order, and which column of a copied row points at what.
 *
 * **A registry rather than thirty-four copy functions**, the shape CAL-023 and
 * CAL-022 already use twice in this layer. Hand-written copies are explicit and
 * wrong the day a model is added: nothing fails, the new table is simply not
 * copied, and the two projects share rows without anything complaining.
 * `prisma/schema.test.ts` pins every line below against `schema.prisma` — the
 * models covered, the reference columns of each, the model each column resolves
 * to, and the order — so a model added later fails there instead.
 *
 * **The copy carries the work, never the record of the work having been done.**
 * Six models stay behind, listed with their reason in `UNDUPLICATED_MODELS`.
 * The two nullable columns that point at one of them from a copied row are
 * nulled rather than carried: a copied `ChapterRevision` keeping the generation
 * id of the original *is* the cross reference this task exists to forbid.
 *
 * **The order is the insertion order**, and it is topological: a model appears
 * after every model it references. `TimelineEvent` references itself
 * (`precedingEventId`), which needs no second pass — every id of a model is
 * allocated before any of its rows is written, and PostgreSQL checks a foreign
 * key at the end of the statement, so one multi-row insert satisfies its own
 * references.
 *
 * This file imports only the registry beside it, for the reason that one
 * imports nothing: the `unit` Vitest project and the schema test must stay free
 * of a database and of `prisma generate`.
 */

import type { ProjectOwnedModelName } from "./owned-models";

/**
 * What a reference column points at. `User` is not project data — an author is
 * the same account before and after a copy — so it is a target the copier keeps
 * rather than remaps.
 */
export type DuplicationTarget = ProjectOwnedModelName | "User";

export interface DuplicationStep {
  readonly model: ProjectOwnedModelName;
  /**
   * Every foreign-key column of the model except the never-copied ones, mapped
   * to the model it names. A column absent from this map is a column the copier
   * carries verbatim, which for a reference would mean pointing at the
   * original — so the map is compared against the schema rather than trusted.
   */
  readonly references: Readonly<Record<string, DuplicationTarget>>;
}

/**
 * The columns a copy never carries. They describe a row's own life rather than
 * the narrative it holds: the copy's rows are new rows, created now, by whoever
 * asked for the duplication. `updatedById` and `version` are the audit block's
 * (CAL-022) and are filled by the extension from the actor scope; `id` is
 * replaced by the copier itself.
 *
 * Everything else is copied verbatim — `validatedAt` and `lockedAt` included.
 * Validating a bible is a decision about content, so the copy inherits the
 * stage the original had reached, which is also what makes its derived status
 * match.
 */
export const NEVER_COPIED_COLUMNS = [
  "id",
  "createdAt",
  "updatedAt",
  "updatedById",
  "version",
] as const;

/**
 * The project-owned models a duplication leaves behind, and why.
 *
 * Each is a record of something that happened *to* the project rather than a
 * part of the novel: a request made to a model, a file written to a bucket, a
 * slug published to the world. A copy has done none of it.
 */
export const UNDUPLICATED_MODELS = {
  Generation:
    "an accounting row for a request the copy never made; its cost is charged to the original",
  GenerationAttempt: "one try of a generation the copy does not have",
  QualityIssue: "the output of an audit the copy has never been subjected to",
  QualityIssuePassage: "an anchor into an issue the copy does not have",
  Export: "names a storage object the original owns, with its own expiry",
  Publication: "holds a globally unique slug and a first-publication date; a copy is unpublished",
} as const satisfies Partial<Record<ProjectOwnedModelName, string>>;

export type UnduplicatedModelName = keyof typeof UNDUPLICATED_MODELS;

export function isUnduplicatedModel(model: DuplicationTarget): model is UnduplicatedModelName {
  return Object.hasOwn(UNDUPLICATED_MODELS, model);
}

/**
 * The narrative tree, in insertion order.
 *
 * `Project` is absent: it is the row the copy is *of*, created by the copier
 * before the plan runs and seeded into the identity map, which is what makes
 * every `projectId` below remap like any other reference.
 */
export const DUPLICATION_PLAN = [
  { model: "SourceText", references: { projectId: "Project" } },
  {
    model: "SourceTextVersion",
    references: { sourceTextId: "SourceText", editedById: "User" },
  },

  { model: "Analysis", references: { projectId: "Project", validatedById: "User" } },
  {
    model: "AnalysisSectionRevision",
    references: {
      analysisId: "Analysis",
      sourceTextVersionId: "SourceTextVersion",
      generationId: "Generation",
      createdById: "User",
    },
  },
  { model: "AnalysisElement", references: { sectionRevisionId: "AnalysisSectionRevision" } },
  // `lineageId` is not a reference and is copied verbatim, which is what keeps
  // a duplicated project's notes attached to its duplicated elements: both
  // sides of the pair are copied, and the pair is only ever compared inside one
  // analysis (CAL-073).
  {
    model: "AnalysisAnnotation",
    references: { analysisId: "Analysis", authorId: "User" },
  },

  { model: "CreativeDirection", references: { projectId: "Project" } },
  {
    model: "DirectionEvaluation",
    references: {
      directionId: "CreativeDirection",
      generationId: "Generation",
      createdById: "User",
    },
  },

  { model: "Bible", references: { projectId: "Project", validatedById: "User" } },
  { model: "BibleIdentity", references: { bibleId: "Bible" } },
  { model: "BibleStyle", references: { bibleId: "Bible" } },
  { model: "BibleWorld", references: { bibleId: "Bible" } },
  { model: "Character", references: { bibleId: "Bible" } },
  {
    model: "Relationship",
    references: { bibleId: "Bible", fromCharacterId: "Character", toCharacterId: "Character" },
  },
  { model: "Place", references: { bibleId: "Bible" } },
  { model: "WorldRule", references: { bibleId: "Bible" } },
  {
    model: "TimelineEvent",
    references: { bibleId: "Bible", precedingEventId: "TimelineEvent" },
  },
  {
    model: "TimelineEventParticipant",
    references: { bibleId: "Bible", eventId: "TimelineEvent", characterId: "Character" },
  },
  {
    model: "CanonFact",
    references: { bibleId: "Bible", invalidatedByEventId: "TimelineEvent" },
  },
  {
    model: "CanonFactBelief",
    references: { bibleId: "Bible", factId: "CanonFact", characterId: "Character" },
  },
  {
    model: "CanonFactSubject",
    references: {
      bibleId: "Bible",
      factId: "CanonFact",
      characterId: "Character",
      placeId: "Place",
    },
  },

  { model: "Outline", references: { projectId: "Project", bibleId: "Bible" } },
  { model: "Part", references: { outlineId: "Outline" } },
  {
    model: "Chapter",
    references: { outlineId: "Outline", bibleId: "Bible", partId: "Part" },
  },
  {
    model: "ChapterOutline",
    references: {
      bibleId: "Bible",
      chapterId: "Chapter",
      focalCharacterId: "Character",
      placeId: "Place",
    },
  },
  {
    model: "ChapterOutlineCharacter",
    references: {
      bibleId: "Bible",
      chapterOutlineId: "ChapterOutline",
      characterId: "Character",
    },
  },
  {
    model: "ChapterOutlineFact",
    references: { bibleId: "Bible", chapterOutlineId: "ChapterOutline", factId: "CanonFact" },
  },
  {
    model: "ChapterRevision",
    references: { chapterId: "Chapter", generationId: "Generation", createdById: "User" },
  },
  // The summaries travel with the text they were made from (CAL-055). They are
  // work the copy would otherwise have to pay a model to redo, and the memory
  // every later chapter of the copy is written against; leaving them behind
  // would hand the duplicate a manuscript with no past.
  {
    model: "ChapterSummaryRevision",
    references: {
      chapterId: "Chapter",
      chapterRevisionId: "ChapterRevision",
      generationId: "Generation",
      createdById: "User",
    },
  },
  {
    model: "PartSummaryRevision",
    references: { partId: "Part", generationId: "Generation", createdById: "User" },
  },

  {
    model: "Thread",
    references: {
      outlineId: "Outline",
      bibleId: "Bible",
      openingChapterId: "Chapter",
      closingChapterId: "Chapter",
    },
  },
  {
    model: "ThreadContinuation",
    references: { bibleId: "Bible", threadId: "Thread", chapterId: "Chapter" },
  },
] as const satisfies readonly DuplicationStep[];

export type DuplicatedModelName = (typeof DUPLICATION_PLAN)[number]["model"];

export const DUPLICATED_MODEL_NAMES = DUPLICATION_PLAN.map(
  (step) => step.model,
) as DuplicatedModelName[];
