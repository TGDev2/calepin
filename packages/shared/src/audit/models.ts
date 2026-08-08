/**
 * The audited models — CAL-022's registry, and the one list the Prisma
 * extension, the schema test and the integration suite all read.
 *
 * **What makes a model audited is not a judgement call.** A model carrying
 * `updatedAt` can be modified, and a row that can be modified must record who
 * modified it last. A model without `updatedAt` is append-only: it is written
 * once and its author is already its creator — `AnalysisSectionRevision`,
 * `ChapterRevision` and `SourceTextVersion` each carry one — or it is a join
 * row asserting nothing of its own. `prisma/schema.test.ts` turns that rule
 * into an assertion, so a model added later with `updatedAt` and no audit block
 * fails there rather than shipping untraceable.
 *
 * One model is deliberately outside the set: `User`. The author of a change to
 * an account is the account holder, which is the row's own `id`; a
 * self-referencing column would add a cycle and no information.
 *
 * This file imports nothing, on purpose. The `unit` Vitest project must stay
 * free of a database and of `prisma generate`, and the schema test reads this
 * registry to check the schema against it.
 */

/** How a model says what state it is in. */
export type AuditStatusKind =
  /** A Prisma enum column — `Project.status`, `Chapter.status`. */
  | "enum"
  /**
   * A nullable timestamp that *is* the state, the shape this schema chose
   * deliberately: `validatedAt`, `lockedAt`. A status enum beside one of these
   * could only ever contradict it (CAL-012's lesson).
   */
  | "timestamp";

export interface AuditedModel {
  /** The `@@map`ped table name, used by the database-level assertions. */
  readonly table: string;
  /**
   * The field naming the row's lifecycle state, or `null` when the product
   * defines none for it. CAL-022 does not invent one: a generic status column
   * beside `Chapter.status` would be the second column able to contradict the
   * first, and on a join row it would be decoration.
   */
  readonly status: string | null;
  readonly statusKind: AuditStatusKind | null;
  /** Why this model has no lifecycle state. Set if and only if `status` is null. */
  readonly statusless: string | null;
}

export const AUDITED_MODELS = {
  Project: { table: "projects", status: "status", statusKind: "enum", statusless: null },
  SourceText: {
    table: "source_texts",
    status: null,
    statusKind: null,
    statusless: "a container for its versions; the state is the latest version's",
  },
  Analysis: {
    table: "analyses",
    status: "validatedAt",
    statusKind: "timestamp",
    statusless: null,
  },
  AnalysisAnnotation: {
    table: "analysis_annotations",
    status: null,
    statusKind: null,
    statusless: "a free note by one author; it is written or it is deleted",
  },
  CreativeDirection: {
    table: "creative_directions",
    status: "origin",
    statusKind: "enum",
    statusless: null,
  },
  Bible: { table: "bibles", status: "validatedAt", statusKind: "timestamp", statusless: null },
  BibleIdentity: {
    table: "bible_identities",
    status: "lockedAt",
    statusKind: "timestamp",
    statusless: null,
  },
  BibleStyle: {
    table: "bible_styles",
    status: "lockedAt",
    statusKind: "timestamp",
    statusless: null,
  },
  Character: { table: "characters", status: "lockedAt", statusKind: "timestamp", statusless: null },
  Relationship: {
    table: "relationships",
    status: "lockedAt",
    statusKind: "timestamp",
    statusless: null,
  },
  Place: { table: "places", status: "lockedAt", statusKind: "timestamp", statusless: null },
  WorldRule: {
    table: "world_rules",
    status: "lockedAt",
    statusKind: "timestamp",
    statusless: null,
  },
  TimelineEvent: {
    table: "timeline_events",
    status: "lockedAt",
    statusKind: "timestamp",
    statusless: null,
  },
  TimelineEventParticipant: {
    table: "timeline_event_participants",
    status: null,
    statusKind: null,
    statusless: "a presence at an event; the row exists or it does not",
  },
  CanonFact: { table: "canon_facts", status: "status", statusKind: "enum", statusless: null },
  CanonFactBelief: {
    table: "canon_fact_beliefs",
    status: "state",
    statusKind: "enum",
    statusless: null,
  },
  CanonFactSubject: {
    table: "canon_fact_subjects",
    status: null,
    statusKind: null,
    statusless: "names what a fact is about; the row exists or it does not",
  },
  Outline: {
    table: "outlines",
    status: null,
    statusKind: null,
    statusless: "the plan's progress is its chapters' statuses, never a second copy",
  },
  Part: {
    table: "parts",
    status: null,
    statusKind: null,
    statusless: "a grouping of chapters; its progress is theirs",
  },
  Chapter: { table: "chapters", status: "status", statusKind: "enum", statusless: null },
  ChapterOutline: {
    table: "chapter_outlines",
    status: null,
    statusKind: null,
    statusless: "the chapter it plans carries the status (Chapter is the spine)",
  },
  Thread: { table: "threads", status: "status", statusKind: "enum", statusless: null },
  Generation: { table: "generations", status: "status", statusKind: "enum", statusless: null },
  QualityIssue: {
    table: "quality_issues",
    status: "status",
    statusKind: "enum",
    statusless: null,
  },
  Export: { table: "exports", status: "status", statusKind: "enum", statusless: null },
  Publication: {
    table: "publications",
    status: "visibility",
    statusKind: "enum",
    statusless: null,
  },
} as const satisfies Record<string, AuditedModel>;

export type AuditedModelName = keyof typeof AUDITED_MODELS;

export const AUDITED_MODEL_NAMES = Object.keys(AUDITED_MODELS) as AuditedModelName[];

/**
 * The one model with `updatedAt` that is deliberately not audited. Named here
 * rather than left implicit so the schema test asserts the exception instead of
 * quietly tolerating any gap.
 */
export const UNAUDITED_MUTABLE_MODELS = ["User"] as const;

/** The three columns the audit block adds, beside the `id`/`createdAt`/`updatedAt` every audited model already had. */
export const AUDIT_AUTHOR_FIELD = "updatedById";
export const AUDIT_AUTHOR_RELATION = "updatedBy";
export const AUDIT_VERSION_FIELD = "version";

/**
 * The sentinel `updatedById` defaults to in PostgreSQL.
 *
 * Without a column default, Prisma makes `updatedById` a required member of
 * every create input — and an extension that fills a field the compiler already
 * demands is decoration. The default takes the column out of the caller's
 * contract; it can never be stored, because no `User` carries that id and
 * `users_id_attributable_check` keeps one from being created.
 */
export const AUDIT_UNATTRIBUTED = "unattributed";

/**
 * The column `AUDIT_AUTHOR_FIELD` writes to. Tables are `@@map`ped to
 * snake_case plural in this schema (CLAUDE.md §4.2) but columns are not, so the
 * column carries the field's own spelling.
 */
export const AUDIT_AUTHOR_COLUMN = "updatedById";

export function isAuditedModel(model: string | undefined): model is AuditedModelName {
  return model !== undefined && Object.hasOwn(AUDITED_MODELS, model);
}
