/**
 * The project-owned models — CAL-023's registry, and the one list the scoped
 * `where` builder, the schema test and the isolation suite all read.
 *
 * **Ownership is a graph property, not a column.** Exactly one row in this
 * schema names an owner: `Project.userId`. Everything else belongs to a user
 * because it hangs, directly or through a chain of relations, off a project
 * they own. Writing that chain out once per model — as a path of relation field
 * names ending at `Project` — is what lets one filter builder serve all
 * thirty-five, instead of thirty-five hand-written `where` clauses of which one
 * will eventually be wrong.
 *
 * `prisma/schema.test.ts` pins the registry against `schema.prisma`: every
 * model but `User` must appear, every segment must be a declared relation on
 * the model before it, and the last one must land on `Project`. A model added
 * later therefore fails there rather than shipping reachable by anyone.
 *
 * `User` is deliberately absent, and so are the three Auth.js tables CAL-024
 * added beside it. An account is not project data — it is the owner — and
 * reading one is authentication's business, under its own rule.
 *
 * This file imports nothing, on purpose, for the reason `audit/models.ts`
 * imports nothing: the `unit` Vitest project must stay free of a database and
 * of `prisma generate`, and the schema test reads this registry to check the
 * schema against it.
 */

export interface ProjectOwnedModel {
  /** The `@@map`ped table name, used by the database-level assertions. */
  readonly table: string;
  /**
   * The relation fields to walk, from this model to `Project`. Empty for
   * `Project` itself, which *is* the owned row.
   *
   * Each segment is the name of a relation field as `schema.prisma` declares
   * it — which is also the key Prisma expects inside a `where`, so the path is
   * the filter, nested.
   */
  readonly path: readonly string[];
}

export const PROJECT_OWNED_MODELS = {
  Project: { table: "projects", path: [] },

  SourceText: { table: "source_texts", path: ["project"] },
  SourceTextVersion: { table: "source_text_versions", path: ["sourceText", "project"] },

  Analysis: { table: "analyses", path: ["project"] },
  AnalysisSectionRevision: { table: "analysis_section_revisions", path: ["analysis", "project"] },
  AnalysisElement: {
    table: "analysis_elements",
    path: ["sectionRevision", "analysis", "project"],
  },
  AnalysisAnnotation: {
    table: "analysis_annotations",
    path: ["element", "sectionRevision", "analysis", "project"],
  },

  CreativeDirection: { table: "creative_directions", path: ["project"] },

  Bible: { table: "bibles", path: ["project"] },
  BibleIdentity: { table: "bible_identities", path: ["bible", "project"] },
  BibleStyle: { table: "bible_styles", path: ["bible", "project"] },
  Character: { table: "characters", path: ["bible", "project"] },
  Relationship: { table: "relationships", path: ["bible", "project"] },
  Place: { table: "places", path: ["bible", "project"] },
  WorldRule: { table: "world_rules", path: ["bible", "project"] },
  TimelineEvent: { table: "timeline_events", path: ["bible", "project"] },
  TimelineEventParticipant: {
    table: "timeline_event_participants",
    path: ["event", "bible", "project"],
  },
  CanonFact: { table: "canon_facts", path: ["bible", "project"] },
  CanonFactBelief: { table: "canon_fact_beliefs", path: ["fact", "bible", "project"] },
  CanonFactSubject: { table: "canon_fact_subjects", path: ["fact", "bible", "project"] },

  Outline: { table: "outlines", path: ["project"] },
  Part: { table: "parts", path: ["outline", "project"] },
  Chapter: { table: "chapters", path: ["outline", "project"] },
  ChapterOutline: { table: "chapter_outlines", path: ["chapter", "outline", "project"] },
  ChapterOutlineCharacter: {
    table: "chapter_outline_characters",
    path: ["chapterOutline", "chapter", "outline", "project"],
  },
  ChapterOutlineFact: {
    table: "chapter_outline_facts",
    path: ["chapterOutline", "chapter", "outline", "project"],
  },
  ChapterRevision: { table: "chapter_revisions", path: ["chapter", "outline", "project"] },
  Thread: { table: "threads", path: ["outline", "project"] },
  ThreadContinuation: { table: "thread_continuations", path: ["thread", "outline", "project"] },

  Generation: { table: "generations", path: ["project"] },
  GenerationAttempt: { table: "generation_attempts", path: ["generation", "project"] },
  QualityIssue: { table: "quality_issues", path: ["project"] },
  QualityIssuePassage: { table: "quality_issue_passages", path: ["issue", "project"] },
  Export: { table: "exports", path: ["project"] },
  Publication: { table: "publications", path: ["project"] },
} as const satisfies Record<string, ProjectOwnedModel>;

export type ProjectOwnedModelName = keyof typeof PROJECT_OWNED_MODELS;

export const PROJECT_OWNED_MODEL_NAMES = Object.keys(
  PROJECT_OWNED_MODELS,
) as ProjectOwnedModelName[];

/**
 * The models that are not project data. Named rather than left implicit, so the
 * schema test asserts the exception instead of tolerating any gap.
 *
 * All four belong to an *account*, not to a project: `User` is the owner, and
 * the three Auth.js tables (CAL-024) are how a request finds out which owner is
 * asking. Scoping them to a project would be circular — the project scope is
 * opened from the answer they give.
 */
export const UNOWNED_MODELS = ["User", "Account", "Session", "VerificationToken"] as const;

/** The column on `Project` that names its owner. The only one in the schema. */
export const PROJECT_OWNER_FIELD = "userId";

export function isProjectOwnedModel(model: string | undefined): model is ProjectOwnedModelName {
  return model !== undefined && Object.hasOwn(PROJECT_OWNED_MODELS, model);
}

/** The Prisma client property serving a model — `CanonFact` → `canonFact`. */
export function delegateName(model: ProjectOwnedModelName): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}
