import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SourceTextEditState } from "@/lib/source-text-edit";

import { SourceTextEditor } from "./source-text-editor";

async function noopAction(previous: SourceTextEditState): Promise<SourceTextEditState> {
  /* never called in a static render */
  return previous;
}

/**
 * React emits `&nbsp;` as the character itself, not as the entity. Named by
 * code point rather than typed, so the assertion cannot be silently normalised
 * away by a formatter or an editing pass (`tasks/lessons.md`, CAL-041).
 */
const NBSP = String.fromCodePoint(0x00a0);

/** A text of exactly `count` words, synthetic and technical (CLAUDE.md §9). */
function wordsOfLength(count: number): string {
  return Array.from({ length: count }, (_unused, index) => `mot${index}`).join(" ");
}

function render(content: string, versionNumber = 1): string {
  return renderToStaticMarkup(
    <SourceTextEditor
      projectId="project-1"
      content={content}
      versionNumber={versionNumber}
      action={noopAction}
    />,
  );
}

describe("SourceTextEditor", () => {
  it("loads the stored text into the field", () => {
    const html = render("mot0 mot1 mot2");

    expect(html).toContain("mot0 mot1 mot2");
    expect(html).toContain('name="content"');
  });

  it("carries the project the edit belongs to, so the action never has to guess", () => {
    expect(render("mot0")).toContain('name="projectId" value="project-1"');
  });

  it("counts the loaded text with the same counter the wizard uses", () => {
    // The number under the field and the number stored on the version come from
    // one function reading one normalized string (CAL-041).
    const html = render(wordsOfLength(42));

    expect(html).toContain(">42<");
    expect(html).toContain("2000 mots");
  });

  it("says which version the author is editing, and that none is overwritten", () => {
    const html = render("mot0", 4);

    expect(html).toContain(`version${NBSP}4`);
    expect(html).toContain("nouvelle version");
    expect(html).toContain("écrasée");
  });

  it("ties the counter to the field for a screen reader", () => {
    const html = render("mot0");

    expect(html).toContain('aria-describedby="source-text-editor-counter"');
    expect(html).toContain('id="source-text-editor-counter"');
  });

  it("never disables its own submit control", () => {
    // An over-limit text is refused by the server. A button that greys itself
    // out is a check a visitor with JavaScript off would not get, and it hides
    // the sentence that explains the refusal.
    const html = render(wordsOfLength(2_100));

    expect(html).toContain("dépasse la limite");
    expect(html).not.toContain("disabled");
  });

  it("announces nothing before anything has been submitted", () => {
    const html = render("mot0");

    expect(html).not.toContain("enregistrée");
    expect(html).not.toContain("Erreur");
  });
});
