/**
 * `@calepin/shared/source-text-import` — extracting and cleaning a source
 * text uploaded as `.txt`, `.md` or `.docx` (CAL-047).
 *
 * A separate export from `@calepin/shared/text` on purpose: `.docx`
 * extraction needs `mammoth`, a Node-only library, and `@calepin/shared/text`
 * is imported by client components (`source-text-counter.tsx`,
 * `project-creation-wizard.tsx`). `tasks/lessons.md` records what happens
 * when a client component imports one pure export off a barrel that also
 * re-exports something Node-only — Turbopack merges the whole barrel into the
 * client chunk before tree-shaking, and the build fails naming the page, not
 * the import (CAL-044). Nothing here is ever imported by a client component;
 * only a `"use server"` action reaches it.
 */

export {
  cleanExtractedText,
  type CleanExtractedTextOptions,
  collapseExcessBlankLines,
  collapseHorizontalWhitespaceRuns,
  normalizeDialogueDashes,
  stripByteOrderMark,
  stripMarkdownBullets,
  stripMarkdownEmphasis,
  stripMarkdownHeadings,
  stripMarkdownHorizontalRules,
  stripMarkdownLinks,
  stripTrailingLineWhitespace,
} from "./clean";
export {
  type ExtractedSourceText,
  extractSourceTextFromFile,
  IMPORTABLE_SOURCE_TEXT_EXTENSIONS,
  importableExtensionOf,
  type ImportableSourceTextExtension,
  MAX_SOURCE_TEXT_IMPORT_BYTES,
  type SourceTextFileInput,
} from "./extract";
