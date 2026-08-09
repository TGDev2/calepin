import { describe, expect, it } from "vitest";

import {
  FRENCH_WORD_COUNT_CORPUS,
  FRENCH_WORD_COUNT_CORPUS_WORDS,
  FRENCH_WORD_COUNT_FIXTURES,
} from "./fixtures";
import { measureSourceText, SOURCE_TEXT_MAX_WORDS } from "./source-text-limit";
import { countWords, normalizeText } from "./word-count";

/**
 * CAL-041's acceptance criterion, at the unit level: **the client and the
 * server never diverge.**
 *
 * They cannot diverge on the *rule*, because there is one implementation and
 * both import it — `apps/web/src/lib/data-access-boundary.test.ts` is the
 * model for proving a structural claim like that, and the equivalent here is
 * simply that no second tokenizer exists to test against.
 *
 * What they *can* still diverge on is the **string**. Between the moment the
 * counter reads a `<textarea>` and the moment the server writes a column, the
 * text passes through a form submission that rewrites its line endings, a
 * `trim()`, and possibly a paste that arrived with decomposed accents. Each of
 * those is a transformation applied on one side and not the other, and each is
 * a way for two correct counts of two different strings to disagree.
 *
 * So this suite models both sides explicitly and asserts they agree, for every
 * fixture, under every transformation the wire actually performs. The
 * browser-to-database version of the same claim is
 * `apps/web/tests/e2e/word-count.spec.ts`.
 */

/**
 * What the client does: the counter measures the raw `<textarea>` value, which
 * always holds `\n` line endings and whatever the visitor last typed.
 */
function clientCount(textareaValue: string): number {
  return measureSourceText(textareaValue).wordCount;
}

/**
 * What the server does: the same measurement, over the value as a form
 * submission delivers it. HTML normalises a textarea to CRLF on submit, so
 * this is genuinely a different string from the one the client counted.
 */
function serverCount(textareaValue: string): number {
  return measureSourceText(asSubmittedByABrowser(textareaValue)).wordCount;
}

/** The CRLF normalisation the HTML form-submission algorithm performs. */
function asSubmittedByABrowser(textareaValue: string): string {
  return textareaValue.replace(/\r\n?|\n/gu, "\r\n");
}

describe("client and server word counts", () => {
  it.each(FRENCH_WORD_COUNT_FIXTURES)("agree on $label", ({ text, wordCount }) => {
    expect(clientCount(text)).toBe(wordCount);
    expect(serverCount(text)).toBe(wordCount);
  });

  it("agree on the whole corpus at once", () => {
    expect(clientCount(FRENCH_WORD_COUNT_CORPUS)).toBe(FRENCH_WORD_COUNT_CORPUS_WORDS);
    expect(serverCount(FRENCH_WORD_COUNT_CORPUS)).toBe(FRENCH_WORD_COUNT_CORPUS_WORDS);
  });

  it("agree when the text arrives with decomposed accents", () => {
    // A paste from another application can carry NFD where a keyboard produces
    // NFC. Same text to a reader, different code points.
    const decomposed = FRENCH_WORD_COUNT_CORPUS.normalize("NFD");

    expect(decomposed).not.toBe(FRENCH_WORD_COUNT_CORPUS);
    expect(clientCount(decomposed)).toBe(FRENCH_WORD_COUNT_CORPUS_WORDS);
    expect(serverCount(decomposed)).toBe(FRENCH_WORD_COUNT_CORPUS_WORDS);
  });

  it("agree when the visitor leaves surrounding whitespace", () => {
    const padded = `\n\n   ${FRENCH_WORD_COUNT_CORPUS}   \n\n`;

    expect(clientCount(padded)).toBe(FRENCH_WORD_COUNT_CORPUS_WORDS);
    expect(serverCount(padded)).toBe(FRENCH_WORD_COUNT_CORPUS_WORDS);
  });

  it("store the same string both sides counted", () => {
    // Not just the same number: the column must hold the text that was
    // measured, or the next recount of the stored row answers differently.
    const stored = normalizeText(asSubmittedByABrowser(FRENCH_WORD_COUNT_CORPUS));

    expect(stored).toBe(normalizeText(FRENCH_WORD_COUNT_CORPUS));
    expect(countWords(stored)).toBe(FRENCH_WORD_COUNT_CORPUS_WORDS);
  });

  it("agree on the verdict at the limit and one word past it", () => {
    const atLimit = Array.from({ length: SOURCE_TEXT_MAX_WORDS }, () => "mot").join("\n");
    const overLimit = `${atLimit}\nmot`;

    expect(measureSourceText(atLimit).isOverLimit).toBe(false);
    expect(measureSourceText(asSubmittedByABrowser(atLimit)).isOverLimit).toBe(false);

    expect(measureSourceText(overLimit).isOverLimit).toBe(true);
    expect(measureSourceText(asSubmittedByABrowser(overLimit)).isOverLimit).toBe(true);
  });
});
