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
