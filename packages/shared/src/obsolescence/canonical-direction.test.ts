import { describe, expect, it } from "vitest";

import {
  assessCanonicalDirectionObsolescence,
  type CanonicalDirectionDependencyState,
  DIRECTION_DEPENDENT_STAGES,
  type DirectionDependentStage,
} from "./canonical-direction";
import { type DownstreamStageState, OBSOLESCENCE_REASONS } from "./chain";
import { DOWNSTREAM_STAGES, downstreamStageRank } from "./stages";

/** A stage the project does not hold. */
const ABSENT: DownstreamStageState = { presentCount: 0, precedingCount: 0 };

/** A stage produced after the retained direction last moved — nothing to redo. */
function current(presentCount = 1): DownstreamStageState {
  return { presentCount, precedingCount: 0 };
}

/** A stage produced before it, in whole or in part. */
function preceding(presentCount = 1, precedingCount = presentCount): DownstreamStageState {
  return { presentCount, precedingCount };
}

function stateOf(
  stages: Partial<Record<DirectionDependentStage, DownstreamStageState>>,
  hasCanonicalDirection = true,
): CanonicalDirectionDependencyState {
  return {
    hasCanonicalDirection,
    stages: { bible: ABSENT, outline: ABSENT, chapters: ABSENT, ...stages },
  };
}

describe("the stages built on the retained direction (CAL-086)", () => {
  it("is everything strictly downstream of the direction, in chain order", () => {
    expect(DIRECTION_DEPENDENT_STAGES).toEqual(["bible", "outline", "chapters"]);
  });

  // The list is derived from the chain rather than written out, so this is the
  // property that has to hold — not the three names above, which only pin
  // today's answer.
  it("holds exactly the stages the chain places after the direction", () => {
    const rank = downstreamStageRank("direction");

    expect(DIRECTION_DEPENDENT_STAGES).toEqual(
      DOWNSTREAM_STAGES.filter((stage) => downstreamStageRank(stage) > rank),
    );
  });

  it("leaves the analysis and the directions themselves out of the chain", () => {
    expect(DIRECTION_DEPENDENT_STAGES).not.toContain("analysis");
    expect(DIRECTION_DEPENDENT_STAGES).not.toContain("direction");
  });
});

describe("what the retained direction has already left behind", () => {
  it("reports nothing at all for a project holding nothing downstream", () => {
    const report = assessCanonicalDirectionObsolescence(stateOf({}));

    expect(report.current.hasObsoleteStages).toBe(false);
    expect(report.current.obsoleteStages).toEqual([]);
    expect(report.current.stages.map((entry) => entry.stage)).toEqual([
      "bible",
      "outline",
      "chapters",
    ]);
  });

  it("names a bible produced before the retained direction last moved", () => {
    const report = assessCanonicalDirectionObsolescence(
      stateOf({ bible: preceding(), outline: current(), chapters: current(4) }),
    );

    expect(report.current.obsoleteStages).toEqual(["bible", "outline", "chapters"]);
    expect(report.current.stages[0]?.reason).toBe("canonical-direction-changed");
    // The plan and the chapters moved after the direction did, so what puts
    // them in doubt is the bible above them, not the direction itself.
    expect(report.current.stages[1]?.reason).toBe("upstream-obsolete");
    expect(report.current.stages[2]?.reason).toBe("upstream-obsolete");
  });

  it("reaches the chapters through a bible the project never held", () => {
    const report = assessCanonicalDirectionObsolescence(
      stateOf({ outline: preceding(), chapters: current(9) }),
    );

    expect(report.current.obsoleteStages).toEqual(["outline", "chapters"]);
  });

  it("keeps the partial count a stage reports", () => {
    const report = assessCanonicalDirectionObsolescence(stateOf({ chapters: preceding(12, 4) }));

    const chapters = report.current.stages.find((entry) => entry.stage === "chapters");

    expect(chapters).toMatchObject({ presentCount: 12, precedingCount: 4, isObsolete: true });
  });

  it("clears a stage rebuilt since, and everything below it that followed", () => {
    const report = assessCanonicalDirectionObsolescence(
      stateOf({ bible: current(), outline: current(), chapters: current(3) }),
    );

    expect(report.current.hasObsoleteStages).toBe(false);
  });

  it("reports nothing when no direction has been retained", () => {
    const report = assessCanonicalDirectionObsolescence(
      stateOf({ bible: current(), outline: current() }, false),
    );

    expect(report.hasCanonicalDirection).toBe(false);
    expect(report.current.hasObsoleteStages).toBe(false);
  });
});

describe("what changing the retained direction now would leave behind", () => {
  // The whole point of the second answer: a bible that is perfectly current
  // today still descends from the direction the author is about to replace.
  it("names every downstream stage the project holds, current or not", () => {
    const report = assessCanonicalDirectionObsolescence(
      stateOf({ bible: current(), outline: current(), chapters: current(7) }),
    );

    expect(report.current.hasObsoleteStages).toBe(false);
    expect(report.onChange.obsoleteStages).toEqual(["bible", "outline", "chapters"]);
    expect(report.onChange.stages.every((entry) => entry.reason !== "upstream-obsolete")).toBe(
      true,
    );
  });

  it("counts the whole of each stage, never a part of it", () => {
    const report = assessCanonicalDirectionObsolescence(stateOf({ chapters: preceding(12, 4) }));

    const chapters = report.onChange.stages.find((entry) => entry.stage === "chapters");

    expect(chapters).toMatchObject({ presentCount: 12, precedingCount: 12 });
  });

  // A first choice warns about nothing, because there is nothing to warn about
  // — which is what keeps the warning meaningful when there is.
  it("warns about nothing when the project holds nothing downstream", () => {
    const report = assessCanonicalDirectionObsolescence(stateOf({}, false));

    expect(report.onChange.hasObsoleteStages).toBe(false);
  });

  it("never invents a reason outside the closed list", () => {
    const report = assessCanonicalDirectionObsolescence(
      stateOf({ bible: preceding(), chapters: preceding(5, 2) }),
    );

    for (const entry of [...report.current.stages, ...report.onChange.stages]) {
      if (entry.reason === null) continue;

      expect(OBSOLESCENCE_REASONS).toContain(entry.reason);
    }
  });
});
