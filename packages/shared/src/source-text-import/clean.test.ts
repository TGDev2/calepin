import { describe, expect, it } from "vitest";

import {
  cleanExtractedText,
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

/**
 * Every fixture here is synthetic and technical (CLAUDE.md §9) — arithmetic
 * over characters, not prose. `EM_DASH` is named rather than typed, the same
 * convention `../text/word-count.test.ts` documents and follows.
 */
const EM_DASH = String.fromCodePoint(0x2014);
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);
const NBSP = String.fromCodePoint(0x00a0);

describe("stripByteOrderMark", () => {
  it("removes a leading byte-order mark", () => {
    expect(stripByteOrderMark(`${BYTE_ORDER_MARK}alpha`)).toBe("alpha");
  });

  it("leaves a text with none untouched", () => {
    expect(stripByteOrderMark("alpha")).toBe("alpha");
  });

  it("never touches one that is not at the very start", () => {
    expect(stripByteOrderMark(`alpha${BYTE_ORDER_MARK}beta`)).toBe(`alpha${BYTE_ORDER_MARK}beta`);
  });
});

describe("collapseHorizontalWhitespaceRuns", () => {
  it("collapses a run of spaces to one", () => {
    expect(collapseHorizontalWhitespaceRuns("alpha    beta")).toBe("alpha beta");
  });

  it("collapses a run of tabs, and a mix of spaces and tabs", () => {
    expect(collapseHorizontalWhitespaceRuns("alpha\t\tbeta")).toBe("alpha beta");
    expect(collapseHorizontalWhitespaceRuns("alpha \t beta")).toBe("alpha beta");
  });

  it("leaves a single space alone", () => {
    expect(collapseHorizontalWhitespaceRuns("alpha beta")).toBe("alpha beta");
  });

  it("never touches a single non-breaking space, narrow or ordinary", () => {
    expect(collapseHorizontalWhitespaceRuns(`alpha${NBSP}!`)).toBe(`alpha${NBSP}!`);
  });

  it("does not cross a newline", () => {
    expect(collapseHorizontalWhitespaceRuns("alpha\n\nbeta")).toBe("alpha\n\nbeta");
  });
});

describe("stripTrailingLineWhitespace", () => {
  it("removes trailing spaces and tabs from every line", () => {
    expect(stripTrailingLineWhitespace("alpha  \nbeta\t\ngamma")).toBe("alpha\nbeta\ngamma");
  });

  it("leaves leading whitespace alone", () => {
    expect(stripTrailingLineWhitespace("  alpha")).toBe("  alpha");
  });
});

describe("collapseExcessBlankLines", () => {
  it("collapses three or more blank lines to two", () => {
    expect(collapseExcessBlankLines("alpha\n\n\n\nbeta")).toBe("alpha\n\nbeta");
  });

  it("leaves one or two blank lines alone", () => {
    expect(collapseExcessBlankLines("alpha\n\nbeta")).toBe("alpha\n\nbeta");
    expect(collapseExcessBlankLines("alpha\nbeta")).toBe("alpha\nbeta");
  });
});

describe("normalizeDialogueDashes", () => {
  it("turns a single hyphen and a space at line start into an em dash", () => {
    expect(normalizeDialogueDashes("- Alpha, beta.")).toBe(`${EM_DASH} Alpha, beta.`);
  });

  it("turns a double hyphen and a space at line start into an em dash", () => {
    expect(normalizeDialogueDashes("-- Alpha, beta.")).toBe(`${EM_DASH} Alpha, beta.`);
  });

  it("preserves leading indentation", () => {
    expect(normalizeDialogueDashes("  - Alpha.")).toBe(`  ${EM_DASH} Alpha.`);
  });

  it("applies to every dialogue line in a text", () => {
    expect(normalizeDialogueDashes("- Alpha ?\n- Beta.")).toBe(
      `${EM_DASH} Alpha ?\n${EM_DASH} Beta.`,
    );
  });

  it("never touches a hyphenated word or a range inside a line", () => {
    expect(normalizeDialogueDashes("rendez-vous alpha")).toBe("rendez-vous alpha");
    expect(normalizeDialogueDashes("pages 12-15")).toBe("pages 12-15");
  });

  it("requires a space after the hyphen — a bare list marker is untouched", () => {
    expect(normalizeDialogueDashes("-alpha")).toBe("-alpha");
  });
});

describe("stripMarkdownHeadings", () => {
  it("removes a heading marker from level one to six", () => {
    expect(stripMarkdownHeadings("# Alpha")).toBe("Alpha");
    expect(stripMarkdownHeadings("###### Alpha")).toBe("Alpha");
  });

  it("leaves a line that only happens to start with a hash-like word alone", () => {
    expect(stripMarkdownHeadings("#alpha")).toBe("#alpha");
  });
});

describe("stripMarkdownBullets", () => {
  it("removes a star or plus bullet marker", () => {
    expect(stripMarkdownBullets("* Alpha")).toBe("Alpha");
    expect(stripMarkdownBullets("+ Alpha")).toBe("Alpha");
  });

  it("never removes a hyphen bullet — that is a dialogue dash's job", () => {
    expect(stripMarkdownBullets("- Alpha")).toBe("- Alpha");
  });
});

describe("stripMarkdownEmphasis", () => {
  it("strips bold markers, both spellings", () => {
    expect(stripMarkdownEmphasis("**alpha**")).toBe("alpha");
    expect(stripMarkdownEmphasis("__alpha__")).toBe("alpha");
  });

  it("strips italic markers, both spellings", () => {
    expect(stripMarkdownEmphasis("*alpha*")).toBe("alpha");
    expect(stripMarkdownEmphasis("_alpha_")).toBe("alpha");
  });

  it("strips bold before italic, leaving no stray marker", () => {
    expect(stripMarkdownEmphasis("**alpha** and *beta*")).toBe("alpha and beta");
  });

  it("never touches a multiplication or a snake_case token", () => {
    expect(stripMarkdownEmphasis("3 * 4 = 12")).toBe("3 * 4 = 12");
    expect(stripMarkdownEmphasis("alpha_beta_gamma")).toBe("alpha_beta_gamma");
  });
});

describe("stripMarkdownLinks", () => {
  it("keeps the link text and discards the target", () => {
    expect(stripMarkdownLinks("[alpha](https://example.test)")).toBe("alpha");
  });

  it("leaves plain text with brackets alone", () => {
    expect(stripMarkdownLinks("[alpha] beta")).toBe("[alpha] beta");
  });
});

describe("stripMarkdownHorizontalRules", () => {
  it("removes a line holding only a horizontal rule, in every spelling", () => {
    expect(stripMarkdownHorizontalRules("alpha\n---\nbeta")).toBe("alpha\nbeta");
    expect(stripMarkdownHorizontalRules("alpha\n***\nbeta")).toBe("alpha\nbeta");
    expect(stripMarkdownHorizontalRules("alpha\n___\nbeta")).toBe("alpha\nbeta");
  });

  it("never removes a dialogue line that merely starts with dashes", () => {
    expect(stripMarkdownHorizontalRules("--- Alpha, beta.")).toBe("--- Alpha, beta.");
  });
});

describe("cleanExtractedText", () => {
  it("runs the full pass for a plain text import — the docx/txt shape", () => {
    const raw = `${BYTE_ORDER_MARK}Alpha   beta.   \n\n\n\n-- Bonjour, dit-il.\n- Bonsoir.`;

    expect(cleanExtractedText(raw, { markdown: false })).toBe(
      `Alpha beta.\n\n${EM_DASH} Bonjour, dit-il.\n${EM_DASH} Bonsoir.`,
    );
  });

  it("also strips markdown decoration when asked to", () => {
    const raw =
      "# Chapitre premier\n\n**Alpha** rencontre *beta* un jour de pluie.\n\n---\n\n- Bonjour.";

    expect(cleanExtractedText(raw, { markdown: true })).toBe(
      `Chapitre premier\n\nAlpha rencontre beta un jour de pluie.\n\n${EM_DASH} Bonjour.`,
    );
  });

  it("leaves markdown syntax alone when not asked to strip it", () => {
    expect(cleanExtractedText("**alpha**", { markdown: false })).toBe("**alpha**");
  });
});
