import {
  DOWNSTREAM_STAGES,
  type DownstreamStage,
  OBSOLESCENCE_REASONS,
  type StageObsolescence,
} from "@calepin/shared/obsolescence";
import { describe, expect, it } from "vitest";

import {
  DOWNSTREAM_STAGE_LABELS,
  downstreamStageLabel,
  OBSOLESCENCE_REASON_LABELS,
  obsolescenceReasonLabel,
  obsolescenceScopeLabel,
} from "./downstream-stage-label";

function entry(stage: DownstreamStage, presentCount: number, precedingCount: number) {
  return {
    stage,
    presentCount,
    precedingCount,
    isObsolete: true,
    reason: precedingCount > 0 ? "source-text-changed" : "upstream-obsolete",
  } satisfies StageObsolescence;
}

describe("downstreamStageLabel", () => {
  it.each([...DOWNSTREAM_STAGES])("gives %s a French label", (stage) => {
    const label = downstreamStageLabel(stage);

    expect(label).toBe(DOWNSTREAM_STAGE_LABELS[stage]);
    expect(label.length).toBeGreaterThan(0);
  });

  it("never repeats a label between two stages", () => {
    const labels = DOWNSTREAM_STAGES.map(downstreamStageLabel);

    expect(new Set(labels).size).toBe(DOWNSTREAM_STAGES.length);
  });
});

describe("obsolescenceReasonLabel", () => {
  it.each([...OBSOLESCENCE_REASONS])("gives %s a French clause", (reason) => {
    expect(obsolescenceReasonLabel(reason)).toBe(OBSOLESCENCE_REASON_LABELS[reason]);
  });

  it("says nothing is wrong, only that something changed upstream", () => {
    // The report is about provenance, never about quality. Wording that told an
    // author their bible was invalid would push them toward discarding work the
    // product deliberately refuses to discard for them.
    for (const reason of OBSOLESCENCE_REASONS) {
      expect(obsolescenceReasonLabel(reason)).not.toMatch(/invalide|incorrect|erron/iu);
    }
  });
});

describe("obsolescenceScopeLabel", () => {
  it("counts the part of a stage that is behind", () => {
    expect(obsolescenceScopeLabel(entry("chapters", 12, 4))).toBe("4 chapitres sur 12");
    expect(obsolescenceScopeLabel(entry("analysis", 17, 3))).toBe("3 sections sur 17");
  });

  it("puts the unit in the singular for one", () => {
    expect(obsolescenceScopeLabel(entry("chapters", 12, 1))).toBe("1 chapitre sur 12");
    expect(obsolescenceScopeLabel(entry("direction", 4, 1))).toBe("1 direction sur 4");
  });

  it("counts nothing for a stage a project holds exactly one of", () => {
    // "1 bible sur 1" is noise; the label alone already says which stage.
    expect(obsolescenceScopeLabel(entry("bible", 1, 1))).toBeNull();
    expect(obsolescenceScopeLabel(entry("outline", 1, 1))).toBeNull();
  });

  it("counts nothing when the doubt is inherited rather than measured", () => {
    // Nothing in this stage predates the edit — it is in doubt because what it
    // was built on is. A fraction would suggest a part of it is safe.
    expect(obsolescenceScopeLabel(entry("chapters", 12, 0))).toBeNull();
  });
});
