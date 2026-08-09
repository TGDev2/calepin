import type { ProjectProgress } from "@calepin/shared/project-status";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProcessStepper } from "./process-stepper";

const NOTHING_DONE: ProjectProgress = {
  isArchived: false,
  hasSourceText: false,
  isAnalysisValidated: false,
  hasCanonicalDirection: false,
  isBibleValidated: false,
  plannedChapterCount: 0,
  writtenChapterCount: 0,
  validatedChapterCount: 0,
  isPublished: false,
};

function render(progress: ProjectProgress): string {
  return renderToStaticMarkup(<ProcessStepper progress={progress} />);
}

/** The `<li>...</li>` fragment naming `label`, for a targeted assertion. */
function stepFragment(html: string, label: string): string {
  const labelIndex = html.indexOf(`>${label}<`);
  if (labelIndex === -1) throw new Error(`step "${label}" not found in rendered markup`);

  const start = html.lastIndexOf("<li", labelIndex);
  const end = html.indexOf("</li>", labelIndex) + "</li>".length;
  return html.slice(start, end);
}

function occurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("ProcessStepper", () => {
  it("marks every step inaccessible on a fresh draft and names none current", () => {
    const html = render(NOTHING_DONE);

    expect(html).not.toContain('aria-current="step"');
    expect(occurrences(html, "Pas encore accessible")).toBe(9);
    expect(html).toContain("Aucune étape");
    expect(html).toContain("pour lancer");
  });

  it("marks exploration and the narrative choice current together, analysis passed", () => {
    const html = render({ ...NOTHING_DONE, hasSourceText: true, isAnalysisValidated: true });

    expect(occurrences(html, 'aria-current="step"')).toBe(2);
    expect(stepFragment(html, "Exploration")).toContain('aria-current="step"');
    expect(stepFragment(html, "Choix narratif")).toContain('aria-current="step"');
    expect(stepFragment(html, "Analyse")).toContain("Franchie");
    expect(stepFragment(html, "Bible")).toContain("Pas encore accessible");

    // Roving tabindex starts on the first current step, not the second one
    // that shares the same underlying status.
    expect(stepFragment(html, "Exploration")).toContain('tabindex="0"');
    expect(stepFragment(html, "Choix narratif")).toContain('tabindex="-1"');
  });

  it("marks coherence control current once every chapter is drafted but not all validated", () => {
    const html = render({
      ...NOTHING_DONE,
      hasSourceText: true,
      isAnalysisValidated: true,
      hasCanonicalDirection: true,
      isBibleValidated: true,
      plannedChapterCount: 3,
      writtenChapterCount: 3,
      validatedChapterCount: 1,
    });

    expect(occurrences(html, 'aria-current="step"')).toBe(1);
    expect(stepFragment(html, "Contrôle")).toContain('aria-current="step"');
    expect(stepFragment(html, "Rédaction")).toContain("Franchie");
    expect(stepFragment(html, "Révision")).toContain("Pas encore accessible");
  });

  it("marks the final revision current once every chapter is validated", () => {
    const html = render({
      ...NOTHING_DONE,
      hasSourceText: true,
      isAnalysisValidated: true,
      hasCanonicalDirection: true,
      isBibleValidated: true,
      plannedChapterCount: 3,
      writtenChapterCount: 3,
      validatedChapterCount: 3,
    });

    expect(stepFragment(html, "Révision")).toContain('aria-current="step"');
    expect(stepFragment(html, "Contrôle")).toContain("Franchie");
    expect(stepFragment(html, "Export")).toContain("Pas encore accessible");
  });

  it("marks export current once the project is published", () => {
    const html = render({
      ...NOTHING_DONE,
      hasSourceText: true,
      isAnalysisValidated: true,
      hasCanonicalDirection: true,
      isBibleValidated: true,
      plannedChapterCount: 3,
      writtenChapterCount: 3,
      validatedChapterCount: 3,
      isPublished: true,
    });

    expect(stepFragment(html, "Export")).toContain('aria-current="step"');
    expect(stepFragment(html, "Révision")).toContain("Franchie");
  });

  it("reads progress under archiving as if it were not archived, and says so", () => {
    const html = render({
      ...NOTHING_DONE,
      isArchived: true,
      hasSourceText: true,
      isAnalysisValidated: true,
      hasCanonicalDirection: true,
      isBibleValidated: true,
      plannedChapterCount: 3,
      writtenChapterCount: 1,
    });

    expect(stepFragment(html, "Rédaction")).toContain('aria-current="step"');
    expect(html).toContain("Projet archivé");
    expect(html).toContain("avant");
  });

  it("carries exactly one roving tab stop across the nine steps", () => {
    const html = render({
      ...NOTHING_DONE,
      hasSourceText: true,
      isAnalysisValidated: true,
      hasCanonicalDirection: true,
    });

    expect(occurrences(html, 'tabindex="0"')).toBe(1);
    expect(occurrences(html, 'tabindex="-1"')).toBe(8);
  });
});
