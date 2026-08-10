/**
 * Summarising a validated chapter, and refreshing the part it belongs to
 * (CAL-055).
 *
 * The sequence CAL-125's validation action will call, and the whole of what
 * "hierarchical summaries" means at runtime:
 *
 *   validated chapter ──► two summaries ──► the part's summary, rebuilt
 *
 * **The port is injected, never imported** (§5.3). Nothing here knows which
 * provider answers, which is exactly what lets these rules be tested without a
 * network call — and what would let the worker of CAL-060 run the same code.
 *
 * **Nothing is written unless the answer parses** (§6). The port validates
 * against the domain's own schema before returning, and the repository is only
 * reached with a value that already satisfies it; a failed generation leaves
 * the chapter with the summary it had.
 *
 * **The status gate is a narrative rule and lives here.** A summary is the
 * memory later chapters are written against, so summarising a first draft would
 * publish something the author has not accepted. CAL-125 owns the transition
 * itself; this module refuses to run before it happened.
 */

import {
  composeChapterSummaryContext,
  composePartSummaryContext,
  type ModelProviderPort,
} from "@calepin/ai";
import { type AppError, ConflictError, fail, type Result, succeed } from "@calepin/shared/errors";
import type { ProjectScope } from "@calepin/shared/repository";

import {
  appendChapterSummaryRevision,
  appendPartSummaryRevision,
  type ChapterSummarySnapshot,
  type PartSummarySnapshot,
  readChapterSummarySubject,
  readPartSummarySubject,
} from "./repository";
import { chapterSummarySchema, partSummarySchema, SUMMARY_WORD_TARGETS } from "./schema";

/**
 * The chapter statuses a summary may be made from — *validé* and *verrouillé*.
 *
 * Spelled as the `ChapterStatus` enum spells them, per the §4.2 carve-out for a
 * union mirroring a column.
 */
export const SUMMARIZABLE_CHAPTER_STATUSES = ["VALIDATED", "LOCKED"] as const;

export interface SummarizeChapterInput {
  readonly port: ModelProviderPort;
  readonly chapterId: string;
  readonly authorId: string;
  /** The generation this runs under, when it runs under one (CAL-061). */
  readonly generationId?: string;
}

export interface SummarizePartInput {
  readonly port: ModelProviderPort;
  readonly partId: string;
  readonly authorId: string;
  readonly generationId?: string;
}

/** What a full validation pass produced. */
export interface RefreshedSummaries {
  readonly chapter: ChapterSummarySnapshot;
  readonly part: PartSummarySnapshot;
}

function chapterNotValidated(): AppError {
  return new ConflictError({
    code: "CHAPTER_NOT_VALIDATED",
    message: "a chapter is summarised once it is validated, not before",
    userMessage: "Ce chapitre doit être validé avant d'être résumé.",
  });
}

/**
 * Produces and stores the brief and detailed summaries of one validated
 * chapter.
 */
export async function summarizeChapter(
  scope: ProjectScope,
  input: SummarizeChapterInput,
): Promise<Result<ChapterSummarySnapshot>> {
  const subject = await readChapterSummarySubject(scope, input.chapterId);
  if (!subject.ok) return subject;

  if (!isSummarizable(subject.value.status)) return fail(chapterNotValidated());

  const composed = composeChapterSummaryContext({
    language: subject.value.language,
    chapterText: subject.value.content,
    briefWordTarget: SUMMARY_WORD_TARGETS.brief,
    detailedWordTarget: SUMMARY_WORD_TARGETS.detailed,
  });

  if (!composed.ok) return composed;

  const generated = await input.port.generateStructured({
    prompt: composed.value.prompt,
    schema: chapterSummarySchema,
  });

  if (!generated.ok) return generated;

  return appendChapterSummaryRevision(scope, {
    chapterId: subject.value.chapterId,
    chapterRevisionId: subject.value.chapterRevisionId,
    briefSummary: generated.value.output.briefSummary,
    detailedSummary: generated.value.output.detailedSummary,
    authorId: input.authorId,
    ...(input.generationId === undefined ? {} : { generationId: input.generationId }),
  });
}

/**
 * Rebuilds the summary of one part from its chapters' current summaries.
 *
 * Rebuilt rather than amended: a part's arc is not the previous arc plus a
 * chapter, and asking a model to extend a summary it cannot see the source of
 * is how a part summary slowly stops describing the part. Appending a new
 * revision is what makes rebuilding free of consequence.
 */
export async function summarizePart(
  scope: ProjectScope,
  input: SummarizePartInput,
): Promise<Result<PartSummarySnapshot>> {
  const subject = await readPartSummarySubject(scope, input.partId);
  if (!subject.ok) return subject;

  const composed = composePartSummaryContext({
    language: subject.value.language,
    partTitle: subject.value.title,
    wordTarget: SUMMARY_WORD_TARGETS.part,
    plannedArc: subject.value.plannedArc,
    chapters: subject.value.chapters,
  });

  if (!composed.ok) return composed;

  const generated = await input.port.generateStructured({
    prompt: composed.value.prompt,
    schema: partSummarySchema,
  });

  if (!generated.ok) return generated;

  return appendPartSummaryRevision(scope, {
    partId: subject.value.partId,
    summary: generated.value.output.summary,
    authorId: input.authorId,
    ...(input.generationId === undefined ? {} : { generationId: input.generationId }),
  });
}

/**
 * The entry point a chapter validation calls (CAL-125): the chapter's summaries
 * first, then the part's.
 *
 * The order is not arbitrary and neither is the sequencing. The part summary is
 * built from the chapters' current summaries, so it has to run after the one
 * that just changed — running them concurrently would rebuild the part from the
 * state before the chapter it was triggered by.
 *
 * The chapter's failure stops the pass, because the part would then be rebuilt
 * from unchanged inputs and produce a revision identical to the one it has. The
 * part's failure does not undo the chapter's: the summaries are already stored,
 * they are already usable by the context composer, and the part summary is one
 * rerun away. That is the "l'échec d'une de ces étapes ne doit pas invalider la
 * validation" the specification asks for, and the reason this is two appends
 * rather than one transaction.
 */
export async function refreshSummariesForValidatedChapter(
  scope: ProjectScope,
  input: SummarizeChapterInput,
): Promise<Result<RefreshedSummaries>> {
  const subject = await readChapterSummarySubject(scope, input.chapterId);
  if (!subject.ok) return subject;

  const chapter = await summarizeChapter(scope, input);
  if (!chapter.ok) return chapter;

  const part = await summarizePart(scope, {
    port: input.port,
    partId: subject.value.partId,
    authorId: input.authorId,
    ...(input.generationId === undefined ? {} : { generationId: input.generationId }),
  });

  if (!part.ok) return part;

  return succeed({ chapter: chapter.value, part: part.value });
}

function isSummarizable(status: string): boolean {
  return (SUMMARIZABLE_CHAPTER_STATUSES as readonly string[]).includes(status);
}
