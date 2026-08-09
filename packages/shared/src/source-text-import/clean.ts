/**
 * Cleaning an imported source text, format by format (CAL-047).
 *
 * Extraction gets plain text out of a `.txt`, `.md` or `.docx` file; this
 * module is the pass that runs on the result before it ever reaches
 * `normalizeText`/`measureSourceText` (`@calepin/shared/text`). It is
 * deliberately separate from that module — see `../text/word-count.ts` for
 * why normalisation is one shared choke point — because what happens here is
 * format-specific artifact removal, not the arithmetic every caller needs.
 *
 * The acceptance line for this task is that a `.docx` "imports cleanly, with
 * no residual tags and no double spaces" — a word processor's own export is
 * the noisiest input this pipeline sees, and the four passes below target
 * exactly what that export leaves behind: a byte-order mark, runs of spaces
 * from justified text, blank paragraphs multiplied by empty runs, and a
 * dialogue dash typed as a bare hyphen because autocorrect never converted it.
 *
 * As in `word-count.ts`, a character built for a regex is named and
 * constructed with `String.fromCodePoint`, never typed literally — the same
 * reviewability reason: `tasks/lessons.md` records a session that shipped an
 * invisible character no diff could show.
 */

const EM_DASH = String.fromCodePoint(0x2014);
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);

/** Word, and some text editors, prefix a UTF-8 file with this. It is not text. */
export function stripByteOrderMark(text: string): string {
  return text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text;
}

/**
 * Runs of two or more plain spaces or tabs, collapsed to one.
 *
 * A justified paragraph in a word processor pads a line with extra spaces to
 * reach the margin; re-flowed as plain text, those become runs sitting in the
 * middle of a sentence. A single non-breaking or narrow non-breaking space —
 * French typography's own, ahead of `!` `?` `;` `:` and inside guillemets — is
 * never touched: this pass only ever collapses a *run*, and neither French
 * spacing character is ever doubled by a word processor.
 */
export function collapseHorizontalWhitespaceRuns(text: string): string {
  return text.replace(/[ \t]{2,}/gu, " ");
}

/** Trailing spaces or tabs a word processor leaves at the end of a line. */
export function stripTrailingLineWhitespace(text: string): string {
  return text.replace(/[ \t]+$/gmu, "");
}

/** Three or more consecutive blank lines — an empty paragraph run — become two. */
export function collapseExcessBlankLines(text: string): string {
  return text.replace(/\n{3,}/gu, "\n\n");
}

/**
 * A markdown bullet marker (`*` or `+`) at the start of a line, removed.
 *
 * `-` is deliberately excluded: in a manuscript, a line starting with a bare
 * hyphen and a space is far more likely to be a French dialogue dash typed
 * without autocorrect than a list item, so it is handled by
 * `normalizeDialogueDashes` instead of being stripped.
 */
export function stripMarkdownBullets(text: string): string {
  return text.replace(/^[ \t]*[*+][ \t]+/gmu, "");
}

/** `#` through `######` heading markers at the start of a line, removed. */
export function stripMarkdownHeadings(text: string): string {
  return text.replace(/^[ \t]*#{1,6}[ \t]+/gmu, "");
}

/**
 * Bold and italic markup, keeping the text it wraps.
 *
 * Bold (`**`/`__`) is stripped before italic (`*`/`_`), or a bold span would
 * be read as two adjacent italic spans first and left with a stray marker.
 * The italic patterns require non-space content immediately inside the
 * markers, so a genuine multiplication (`3 * 4`) or a snake_case token is
 * left alone.
 */
export function stripMarkdownEmphasis(text: string): string {
  return text
    .replace(/\*\*(\S(?:.*?\S)?)\*\*/gsu, "$1")
    .replace(/__(\S(?:.*?\S)?)__/gsu, "$1")
    .replace(/(?<![*\w])\*(\S(?:.*?\S)?)\*(?![*\w])/gsu, "$1")
    .replace(/\b_(\S(?:.*?\S)?)_\b/gsu, "$1");
}

/** `[text](url)` link syntax, keeping only `text`. */
export function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1");
}

/** A line holding only a horizontal rule (`---`, `***` or `___`), removed. */
export function stripMarkdownHorizontalRules(text: string): string {
  return text.replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$\n?/gmu, "");
}

/**
 * The French dialogue dash, normalised.
 *
 * A line that opens (after any leading spaces) with one or two hyphen-minus
 * characters and a space — `- ` or `-- ` — is read as a dialogue dash typed
 * without the autocorrect a word processor usually supplies, and becomes an
 * em dash (the character `FRENCH_WORD_COUNT_FIXTURES` already tests dialogue
 * with, in `../text/fixtures.ts`). Scoped to the start of a line only, so a
 * hyphenated word or a numeric range inside a sentence is never touched.
 */
export function normalizeDialogueDashes(text: string): string {
  return text.replace(/^([ \t]*)-{1,2} /gmu, `$1${EM_DASH} `);
}

function stripMarkdownDecoration(text: string): string {
  return stripMarkdownLinks(
    stripMarkdownEmphasis(
      stripMarkdownBullets(stripMarkdownHorizontalRules(stripMarkdownHeadings(text))),
    ),
  );
}

export interface CleanExtractedTextOptions {
  /** Whether to strip Markdown decoration before the format-agnostic passes. */
  readonly markdown: boolean;
}

/**
 * The full cleanup pass, in the order that makes each step meaningful for the
 * next: Markdown decoration first (so a horizontal-rule line disappears
 * before blank-line collapsing has to deal with the gap it leaves), then the
 * dialogue dash — which must run before whitespace collapsing, or a `-  `
 * with more than one space would no longer match a single trailing space —
 * then whitespace, then blank lines.
 */
export function cleanExtractedText(text: string, options: CleanExtractedTextOptions): string {
  const withoutBom = stripByteOrderMark(text);
  const withoutMarkdown = options.markdown ? stripMarkdownDecoration(withoutBom) : withoutBom;
  const withDashesNormalized = normalizeDialogueDashes(withoutMarkdown);
  const withoutRuns = collapseHorizontalWhitespaceRuns(withDashesNormalized);
  const withoutTrailingSpace = stripTrailingLineWhitespace(withoutRuns);
  const withoutExcessBlankLines = collapseExcessBlankLines(withoutTrailingSpace);

  // Mammoth pads every paragraph, the last included, with a trailing blank
  // line — trimming here means the field an author sees never opens or ends
  // on empty lines, without waiting for the `normalizeText` a submit applies.
  return withoutExcessBlankLines.trim();
}
