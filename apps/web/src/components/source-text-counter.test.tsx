import {
  FRENCH_WORD_COUNT_CORPUS,
  FRENCH_WORD_COUNT_CORPUS_WORDS,
  measureSourceText,
  SOURCE_TEXT_CAUTION_WORDS,
  SOURCE_TEXT_MAX_WORDS,
  SOURCE_TEXT_WARNING_WORDS,
} from "@calepin/shared/text";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SourceTextCounter } from "./source-text-counter";

/**
 * `renderToStaticMarkup`, no jsdom — the pattern `process-stepper.test.tsx`
 * established, and the reason `SourceTextCounter` was kept a pure function of
 * its props rather than a stateful client component.
 */
function render(text: string): string {
  return renderToStaticMarkup(<SourceTextCounter text={text} />);
}

/** A text of exactly `count` words, synthetic and technical (CLAUDE.md §9). */
function wordsOfLength(count: number): string {
  return Array.from({ length: count }, (_unused, index) => `mot${index}`).join(" ");
}

describe("SourceTextCounter", () => {
  it("shows the count and the ceiling, and warns about nothing, on a short text", () => {
    const html = render(wordsOfLength(10));

    expect(html).toContain(">10<");
    expect(html).toContain("2000 mots");
    expect(html).toContain('data-level="ok"');
    expect(html).not.toContain("Il vous reste");
    expect(html).not.toContain("Plus que");
    expect(html).not.toContain("dépasse la limite");
  });

  it("announces politely rather than assertively", () => {
    // The count changes on every keystroke; an assertive region would
    // interrupt a screen-reader user mid-word, every word.
    const html = render(wordsOfLength(10));

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('role="alert"');
  });

  it("starts mentioning the remaining budget at 75 %", () => {
    const html = render(wordsOfLength(SOURCE_TEXT_CAUTION_WORDS));

    expect(html).toContain('data-level="caution"');
    expect(html).toContain("Il vous reste 500 mots.");
  });

  it("presses harder at 90 %", () => {
    const html = render(wordsOfLength(SOURCE_TEXT_WARNING_WORDS));

    expect(html).toContain('data-level="warning"');
    expect(html).toContain("Plus que 200 mots avant la limite.");
  });

  it("still accepts the limit itself", () => {
    const html = render(wordsOfLength(SOURCE_TEXT_MAX_WORDS));

    expect(html).toContain('data-level="warning"');
    expect(html).not.toContain("dépasse la limite");
  });

  it("refuses one word past the limit, naming both the ceiling and the count", () => {
    const html = render(wordsOfLength(SOURCE_TEXT_MAX_WORDS + 1));

    expect(html).toContain('data-level="over"');
    expect(html).toContain("Le texte source dépasse la limite de 2000 mots (actuellement 2001).");
  });

  it("shows the same number the shared measurement gives for French typography", () => {
    // The counter must not be counting "about the same way" as the server —
    // this asserts it renders exactly `measureSourceText`'s answer for the
    // corpus the parity suite and the e2e spec both use.
    const html = render(FRENCH_WORD_COUNT_CORPUS);

    expect(measureSourceText(FRENCH_WORD_COUNT_CORPUS).wordCount).toBe(
      FRENCH_WORD_COUNT_CORPUS_WORDS,
    );
    expect(html).toContain(`>${FRENCH_WORD_COUNT_CORPUS_WORDS}<`);
  });

  it("counts nothing in an empty field", () => {
    const html = render("");

    expect(html).toContain(">0<");
    expect(html).toContain('data-level="ok"');
  });
});
