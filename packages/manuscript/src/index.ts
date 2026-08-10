/**
 * @calepin/manuscript — chapter writing, editing and versions
 *
 * Public surface of the domain. Everything other workspaces are allowed to use
 * is re-exported from here; nothing reaches into `src/` directly.
 *
 * Backlog: E11 — CAL-112 to CAL-125
 */

export {
  type AppendChapterRevisionInput,
  appendEditedChapterRevision,
  appendGeneratedChapterRevision,
  type AppendGeneratedChapterRevisionInput,
  type ChapterRevisionOrigin,
  type ChapterRevisionSummary,
  deleteChapter,
  type DeleteChapterInput,
  restoreChapterRevision,
  type RestoreChapterRevisionInput,
} from "./chapter/revision";
export {
  type AppendChapterSummaryInput,
  appendChapterSummaryRevision,
  type AppendPartSummaryInput,
  appendPartSummaryRevision,
  type ChapterSummarySnapshot,
  type ChapterSummarySubject,
  type PartSummarySnapshot,
  type PartSummarySubject,
  type PrecedingSummaries,
  readChapterSummarySubject,
  readCurrentChapterSummary,
  readPartSummarySubject,
  readPrecedingSummaries,
} from "./summary/repository";
export {
  type ChapterSummary,
  chapterSummarySchema,
  CONTEXT_CHAR_CEILINGS,
  type PartSummary,
  partSummarySchema,
  SUMMARY_CHAR_CEILINGS,
  SUMMARY_WORD_TARGETS,
} from "./summary/schema";
export {
  type RefreshedSummaries,
  refreshSummariesForValidatedChapter,
  SUMMARIZABLE_CHAPTER_STATUSES,
  summarizeChapter,
  type SummarizeChapterInput,
  summarizePart,
  type SummarizePartInput,
} from "./summary/summarize";
