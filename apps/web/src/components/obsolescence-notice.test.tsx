import {
  assessSourceTextObsolescence,
  type DownstreamStage,
  type DownstreamStageState,
  type SourceTextObsolescence,
} from "@calepin/shared/obsolescence";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ObsolescenceNotice } from "./obsolescence-notice";

/**
 * `renderToStaticMarkup`, no jsdom — the pattern `source-text-counter.test.tsx`
 * and `process-stepper.test.tsx` established, and the reason this panel was
 * kept a pure function of its props.
 */
function render(report: SourceTextObsolescence): string {
  return renderToStaticMarkup(<ObsolescenceNotice report={report} />);
}

const ABSENT: DownstreamStageState = { presentCount: 0, precedingCount: 0 };

/** A report built by the real rule, so the panel is never shown an impossible one. */
function reportOf(
  stages: Partial<Record<DownstreamStage, DownstreamStageState>>,
): SourceTextObsolescence {
  return assessSourceTextObsolescence({
    currentVersionNumber: 3,
    versionCount: 3,
    stages: {
      analysis: ABSENT,
      direction: ABSENT,
      bible: ABSENT,
      outline: ABSENT,
      chapters: ABSENT,
      ...stages,
    },
  });
}

describe("ObsolescenceNotice", () => {
  it("renders nothing at all when no stage is in doubt", () => {
    // Not an empty panel saying everything is fine: a project whose source text
    // was never edited would otherwise carry a permanent box about a risk that
    // has not arisen.
    expect(render(reportOf({}))).toBe("");
    expect(render(reportOf({ analysis: { presentCount: 17, precedingCount: 0 } }))).toBe("");
  });

  it("names every stage the edit left behind, and no other", () => {
    const html = render(
      reportOf({
        analysis: { presentCount: 17, precedingCount: 4 },
        chapters: { presentCount: 12, precedingCount: 0 },
      }),
    );

    expect(html).toContain('data-stage="analysis"');
    expect(html).toContain('data-stage="chapters"');
    expect(html).not.toContain('data-stage="bible"');
    expect(html).not.toContain('data-stage="outline"');
  });

  it("says how much of a stage is behind when counting says something", () => {
    const html = render(reportOf({ chapters: { presentCount: 12, precedingCount: 4 } }));

    expect(html).toContain("4 chapitres sur 12");
  });

  it("distinguishes a stage that is itself behind from one that inherited the doubt", () => {
    const html = render(
      reportOf({
        analysis: { presentCount: 17, precedingCount: 17 },
        bible: { presentCount: 1, precedingCount: 0 },
      }),
    );

    expect(html).toContain("version antérieure du texte source");
    expect(html).toContain("cette modification touche déjà");
  });

  it("states that nothing was deleted and nothing will be regenerated", () => {
    // The acceptance criterion of CAL-046, on screen. The apostrophes are the
    // escaped ones React emits in static markup.
    const html = render(reportOf({ analysis: { presentCount: 17, precedingCount: 1 } }));

    expect(html).toContain("intactes");
    expect(html).toContain("rien n&#x27;a été supprimé");
    expect(html).toContain("rien ne sera régénéré sans vous");
  });

  it("offers no way to delete or regenerate anything", () => {
    const html = render(
      reportOf({
        analysis: { presentCount: 17, precedingCount: 17 },
        chapters: { presentCount: 12, precedingCount: 12 },
      }),
    );

    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<a ");
  });

  it("names the version the report was taken against", () => {
    const html = render(reportOf({ outline: { presentCount: 1, precedingCount: 1 } }));

    expect(html).toContain("version");
    expect(html).toContain("3");
  });

  it("announces politely rather than assertively", () => {
    // A standing fact about the project, rendered on every visit — not an
    // interruption. Also keeps the panel out of the strict-mode collision with
    // Next's own route announcer.
    const html = render(reportOf({ outline: { presentCount: 1, precedingCount: 1 } }));

    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
  });
});
