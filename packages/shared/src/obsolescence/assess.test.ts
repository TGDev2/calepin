import { describe, expect, it } from "vitest";

import { assessSourceTextObsolescence, type SourceTextDependencyState } from "./assess";
import { type DownstreamStageState, OBSOLESCENCE_REASONS } from "./chain";
import { DOWNSTREAM_STAGES, type DownstreamStage, downstreamStageRank } from "./stages";

/** A stage the project does not hold. */
const ABSENT: DownstreamStageState = { presentCount: 0, precedingCount: 0 };

/** A stage produced after the current source text version — nothing to redo. */
function current(presentCount = 1): DownstreamStageState {
  return { presentCount, precedingCount: 0 };
}

/** A stage produced before the current version, in whole or in part. */
function preceding(presentCount = 1, precedingCount = presentCount): DownstreamStageState {
  return { presentCount, precedingCount };
}

function stateOf(
  stages: Partial<Record<DownstreamStage, DownstreamStageState>>,
  versions: { currentVersionNumber: number; versionCount: number } = {
    currentVersionNumber: 2,
    versionCount: 2,
  },
): SourceTextDependencyState {
  return {
    ...versions,
    stages: {
      analysis: ABSENT,
      direction: ABSENT,
      bible: ABSENT,
      outline: ABSENT,
      chapters: ABSENT,
      ...stages,
    },
  };
}

/**
 * The reason reported for one stage. Deliberately not written with `?.reason ??
 * fallback`: `null` is the answer for a stage that is *fine*, and `??` would
 * collapse it into the fallback meant for a stage that is missing entirely.
 */
function reasonFor(
  report: ReturnType<typeof assessSourceTextObsolescence>,
  stage: DownstreamStage,
) {
  const entry = report.stages.find((candidate) => candidate.stage === stage);

  return entry === undefined ? "no-such-stage" : entry.reason;
}

describe("the downstream stage chain", () => {
  it("names the five stages a source text feeds, in dependency order", () => {
    expect(DOWNSTREAM_STAGES).toEqual(["analysis", "direction", "bible", "outline", "chapters"]);
  });

  it("ranks a stage by how many stages it depends on", () => {
    expect(downstreamStageRank("analysis")).toBe(0);
    expect(downstreamStageRank("chapters")).toBe(DOWNSTREAM_STAGES.length - 1);
  });
});

describe("assessSourceTextObsolescence", () => {
  it("reports every stage, in the chain's order, whether the project holds it or not", () => {
    const report = assessSourceTextObsolescence(stateOf({}));

    expect(report.stages.map((entry) => entry.stage)).toEqual([...DOWNSTREAM_STAGES]);
  });

  it("finds nothing in doubt in a project that holds nothing yet", () => {
    const report = assessSourceTextObsolescence(stateOf({}));

    expect(report.hasObsoleteStages).toBe(false);
    expect(report.obsoleteStages).toEqual([]);
    expect(report.stages.every((entry) => entry.reason === null)).toBe(true);
  });

  it("never puts an absent stage in doubt, however far behind the rest is", () => {
    const report = assessSourceTextObsolescence(
      stateOf({ analysis: preceding(17), chapters: ABSENT }),
    );

    expect(report.obsoleteStages).toEqual(["analysis"]);
    expect(reasonFor(report, "chapters")).toBeNull();
  });

  it("finds nothing in doubt when every stage was produced after the current version", () => {
    const report = assessSourceTextObsolescence(
      stateOf({
        analysis: current(17),
        direction: current(3),
        bible: current(),
        outline: current(),
        chapters: current(12),
      }),
    );

    expect(report.hasObsoleteStages).toBe(false);
  });

  it("puts a stage produced before the current version in doubt, and says why", () => {
    const report = assessSourceTextObsolescence(stateOf({ analysis: preceding(17, 4) }));

    expect(report.obsoleteStages).toEqual(["analysis"]);
    expect(reasonFor(report, "analysis")).toBe("source-text-changed");
  });

  it("carries the doubt down to a stage that is itself recent", () => {
    // The author edited the source text, then wrote a direction by hand without
    // touching the analysis. The direction is newer than the edit and still
    // descends from an analysis that is not.
    const report = assessSourceTextObsolescence(
      stateOf({ analysis: preceding(17), direction: current(2) }),
    );

    expect(report.obsoleteStages).toEqual(["analysis", "direction"]);
    expect(reasonFor(report, "direction")).toBe("upstream-obsolete");
  });

  it("does not let a regenerated analysis clear the stages built on the old one", () => {
    // This is the case the whole rule exists for. The analysis has been redone
    // against the new version, so it is current; the direction under it has not
    // been touched since before the edit.
    const report = assessSourceTextObsolescence(
      stateOf({
        analysis: current(17),
        direction: preceding(3),
        bible: preceding(),
        outline: preceding(),
        chapters: preceding(12),
      }),
    );

    expect(report.obsoleteStages).toEqual(["direction", "bible", "outline", "chapters"]);
    expect(reasonFor(report, "analysis")).toBeNull();
  });

  it("carries the doubt across a stage the project skipped", () => {
    const report = assessSourceTextObsolescence(
      stateOf({ analysis: preceding(17), direction: ABSENT, bible: current() }),
    );

    expect(report.obsoleteStages).toEqual(["analysis", "bible"]);
    expect(reasonFor(report, "bible")).toBe("upstream-obsolete");
  });

  it("names the stage's own lag rather than the inherited one when both hold", () => {
    const report = assessSourceTextObsolescence(
      stateOf({ analysis: preceding(17), chapters: preceding(12, 5) }),
    );

    expect(reasonFor(report, "chapters")).toBe("source-text-changed");
  });

  it("never propagates backwards: a stale chapter says nothing about the analysis", () => {
    const report = assessSourceTextObsolescence(
      stateOf({ analysis: current(17), chapters: preceding(12) }),
    );

    expect(report.obsoleteStages).toEqual(["chapters"]);
  });

  it("keeps the counts it was given, so a screen can say four out of twelve", () => {
    const report = assessSourceTextObsolescence(stateOf({ chapters: preceding(12, 4) }));

    expect(report.stages.at(-1)).toMatchObject({
      stage: "chapters",
      presentCount: 12,
      precedingCount: 4,
      isObsolete: true,
    });
  });

  it("carries the version the report was taken against", () => {
    const report = assessSourceTextObsolescence(
      stateOf({}, { currentVersionNumber: 7, versionCount: 7 }),
    );

    expect(report).toMatchObject({ currentVersionNumber: 7, versionCount: 7 });
  });

  it("keeps obsoleteStages and hasObsoleteStages in step with the stage list", () => {
    const report = assessSourceTextObsolescence(
      stateOf({ analysis: preceding(17), outline: current() }),
    );

    const flagged = report.stages.filter((entry) => entry.isObsolete).map((entry) => entry.stage);

    expect(report.obsoleteStages).toEqual(flagged);
    expect(report.hasObsoleteStages).toBe(flagged.length > 0);
  });

  it("only ever answers with a reason the closed list holds", () => {
    const report = assessSourceTextObsolescence(
      stateOf({
        analysis: preceding(17),
        direction: current(2),
        bible: preceding(),
        outline: ABSENT,
        chapters: current(4),
      }),
    );

    for (const entry of report.stages) {
      if (entry.reason === null) continue;

      expect(OBSOLESCENCE_REASONS).toContain(entry.reason);
    }
  });
});
