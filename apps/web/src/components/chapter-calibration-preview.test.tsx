import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChapterCalibrationPreview } from "./chapter-calibration-preview";

/** `toLocaleString("fr-FR")` groups thousands with U+202F, not a plain space. */
function frGrouped(value: number): string {
  return value.toLocaleString("fr-FR");
}

/**
 * `renderToStaticMarkup`, no jsdom — `source-text-counter.test.tsx`'s
 * pattern, and the reason to check here: this suite exercises the
 * component's initial render (the fresh estimate) for each draft input, not
 * the interactive override — that behavior is covered by the manual/e2e
 * check in `tasks/todo.md`, since this repository runs its unit project
 * under Node rather than jsdom.
 */
function render(targetLength: string, targetWordCount = ""): string {
  return renderToStaticMarkup(
    <ChapterCalibrationPreview
      draftTargetLength={targetLength}
      draftTargetWordCount={targetWordCount}
    />,
  );
}

describe("ChapterCalibrationPreview", () => {
  it("renders nothing for an unresolved draft", () => {
    expect(render("")).toBe("");
    expect(render("CUSTOM", "")).toBe("");
    expect(render("CUSTOM", "not-a-number")).toBe("");
    expect(render("CUSTOM", "0")).toBe("");
  });

  it("shows the STANDARD preset's estimate and a total inside the 10% margin", () => {
    const html = render("STANDARD");

    expect(html).toContain("environ 22 chapitres");
    expect(html).toContain(frGrouped(2_955));
    expect(html).toContain("Dans la marge de 10 %.");
    expect(html).not.toContain("Hors de la marge");
  });

  it("resolves a custom word count and derives its own estimate", () => {
    const html = render("CUSTOM", "100000");

    expect(html).toContain("environ 33 chapitres");
    expect(html).toContain(frGrouped(3_030));
  });

  it("announces the gap politely rather than assertively", () => {
    const html = render("SHORT");

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("names both editable fields for a screen reader", () => {
    const html = render("LONG");

    expect(html).toContain('aria-label="Nombre de chapitres"');
    expect(html).toContain('aria-label="Longueur cible par chapitre"');
  });

  it("labels the preview as indicative, not a stored decision", () => {
    const html = render("STANDARD");

    expect(html).toContain("cet aperçu n&#x27;est pas encore enregistré");
  });
});
