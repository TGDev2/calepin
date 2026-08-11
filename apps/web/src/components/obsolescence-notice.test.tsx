import {
  assessCanonicalDirectionObsolescence,
  assessSourceTextObsolescence,
  type CanonicalDirectionObsolescence,
  type DirectionDependentStage,
  type DownstreamStage,
  type DownstreamStageState,
  type SourceTextObsolescence,
} from "@calepin/shared/obsolescence";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DirectionChangeWarning,
  DirectionObsolescenceNotice,
  ObsolescenceNotice,
} from "./obsolescence-notice";

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

/** The direction's own report, built by the real rule for the same reason. */
function directionReportOf(
  stages: Partial<Record<DirectionDependentStage, DownstreamStageState>>,
  hasCanonicalDirection = true,
): CanonicalDirectionObsolescence {
  return assessCanonicalDirectionObsolescence({
    hasCanonicalDirection,
    stages: { bible: ABSENT, outline: ABSENT, chapters: ABSENT, ...stages },
  });
}

describe("DirectionObsolescenceNotice", () => {
  it("renders nothing while nothing descends from a replaced direction", () => {
    const html = renderToStaticMarkup(
      <DirectionObsolescenceNotice report={directionReportOf({}).current} />,
    );

    expect(html).toBe("");
  });

  it("names the stages built on the direction that was replaced", () => {
    const html = renderToStaticMarkup(
      <DirectionObsolescenceNotice
        report={
          directionReportOf({
            bible: { presentCount: 1, precedingCount: 1 },
            chapters: { presentCount: 8, precedingCount: 8 },
          }).current
        }
      />,
    );

    expect(html).toContain('data-stage="bible"');
    expect(html).toContain('data-stage="chapters"');
    expect(html).toContain("8 chapitres sur 8");
    expect(html).toContain("autre direction romanesque");
  });

  it("states that nothing was deleted and nothing will be regenerated", () => {
    const html = renderToStaticMarkup(
      <DirectionObsolescenceNotice
        report={directionReportOf({ bible: { presentCount: 1, precedingCount: 1 } }).current}
      />,
    );

    expect(html).toContain("intactes");
    expect(html).toContain("rien n&#x27;a été supprimé");
    expect(html).toContain("rien ne sera régénéré sans vous");
  });

  it("offers no way to delete or regenerate anything", () => {
    const html = renderToStaticMarkup(
      <DirectionObsolescenceNotice
        report={directionReportOf({ outline: { presentCount: 1, precedingCount: 1 } }).current}
      />,
    );

    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
  });
});

describe("DirectionChangeWarning", () => {
  it("renders nothing when the project holds nothing built on its direction", () => {
    const html = renderToStaticMarkup(
      <DirectionChangeWarning report={directionReportOf({}).onChange} />,
    );

    expect(html).toBe("");
  });

  // It sits inside a form, once per direction card, so a heading id would be
  // in the document three times over.
  it("carries no id and no heading of its own", () => {
    const html = renderToStaticMarkup(
      <DirectionChangeWarning
        report={directionReportOf({ bible: { presentCount: 1, precedingCount: 0 } }).onChange}
      />,
    );

    expect(html).not.toContain("id=");
    expect(html).not.toContain("aria-labelledby");
    expect(html).not.toContain("<h3");
  });

  // The whole point of the second answer: a bible produced *after* the current
  // direction was retained still descends from it, and replacing it puts that
  // bible in doubt.
  it("warns about work that is perfectly current today", () => {
    const report = directionReportOf({
      bible: { presentCount: 1, precedingCount: 0 },
      outline: { presentCount: 1, precedingCount: 0 },
    });

    expect(renderToStaticMarkup(<DirectionObsolescenceNotice report={report.current} />)).toBe("");

    const html = renderToStaticMarkup(<DirectionChangeWarning report={report.onChange} />);

    expect(html).toContain('data-stage="bible"');
    expect(html).toContain('data-stage="outline"');
  });

  it("promises no deletion and no regeneration either", () => {
    const html = renderToStaticMarkup(
      <DirectionChangeWarning
        report={directionReportOf({ chapters: { presentCount: 3, precedingCount: 3 } }).onChange}
      />,
    );

    expect(html).toContain("ne supprimera");
    expect(html).toContain("ne régénérera");
    expect(html).not.toContain("<button");
  });
});
