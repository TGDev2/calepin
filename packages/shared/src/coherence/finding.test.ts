import { describe, expect, it } from "vitest";

import {
  blocksValidation,
  COHERENCE_FINGERPRINT_PATTERN,
  type CoherenceFinding,
  coherenceFingerprint,
  fingerprintFinding,
  isCoherenceFingerprint,
} from "./finding";

function aFinding(overrides: Partial<CoherenceFinding> = {}): CoherenceFinding {
  return {
    checkId: "bible-canon-fact-collision",
    category: "FACTUAL_CONTINUITY",
    severity: "CRITICAL",
    anchor: ["fact-a", "fact-b"],
    explanation: "Deux faits se contredisent.",
    proposedFix: null,
    ...overrides,
  };
}

describe("coherenceFingerprint", () => {
  it("produces the shape the unique index is built on", () => {
    const fingerprint = coherenceFingerprint("bible-canon-fact-collision", ["a"]);

    expect(fingerprint).toMatch(COHERENCE_FINGERPRINT_PATTERN);
    expect(isCoherenceFingerprint(fingerprint)).toBe(true);
  });

  it("is the same identity whichever order a check emits a pair in", () => {
    expect(coherenceFingerprint("bible-canon-fact-collision", ["a", "b"])).toBe(
      coherenceFingerprint("bible-canon-fact-collision", ["b", "a"]),
    );
  });

  it("separates two checks reaching the same rows", () => {
    expect(coherenceFingerprint("bible-canon-fact-collision", ["a", "b"])).not.toBe(
      coherenceFingerprint("bible-opposed-canon-facts", ["a", "b"]),
    );
  });

  it("cannot have its anchor parts rearranged into another anchor's material", () => {
    // The join is injective because every part is written as JSON first. Without
    // that, two parts and one concatenated part would hash alike, and one
    // contradiction would silently inherit another's arbitration.
    expect(coherenceFingerprint("bible-undeclared-name", ["a", "b"])).not.toBe(
      coherenceFingerprint("bible-undeclared-name", ["ab"]),
    );
    expect(coherenceFingerprint("bible-undeclared-name", ['a"b'])).not.toBe(
      coherenceFingerprint("bible-undeclared-name", ["a", "b"]),
    );
  });

  it("is stable across calls — an identity, not a coincidence", () => {
    const anchor = ["event-3", "character-7"];

    expect(coherenceFingerprint("bible-timeline-arithmetic", anchor)).toBe(
      coherenceFingerprint("bible-timeline-arithmetic", [...anchor].reverse()),
    );
  });

  it("does not mutate the anchor it was handed", () => {
    const anchor = ["b", "a"];
    coherenceFingerprint("bible-undeclared-name", anchor);

    expect(anchor).toEqual(["b", "a"]);
  });
});

describe("fingerprintFinding", () => {
  it("carries the finding through and adds its identity", () => {
    const finding = aFinding();
    const fingerprinted = fingerprintFinding(finding);

    expect(fingerprinted.explanation).toBe(finding.explanation);
    expect(fingerprinted.fingerprint).toBe(coherenceFingerprint(finding.checkId, finding.anchor));
  });

  it("gives a reworded finding the same identity — a decision survives the rewording", () => {
    const first = fingerprintFinding(aFinding());
    const second = fingerprintFinding(aFinding({ explanation: "Autre formulation." }));

    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it("gives a finding about other rows another identity", () => {
    const first = fingerprintFinding(aFinding());
    const second = fingerprintFinding(aFinding({ anchor: ["fact-a", "fact-c"] }));

    expect(second.fingerprint).not.toBe(first.fingerprint);
  });
});

describe("blocksValidation", () => {
  it("blocks on CRITICAL and on nothing else", () => {
    expect(blocksValidation("CRITICAL")).toBe(true);
    expect(blocksValidation("MAJOR")).toBe(false);
    expect(blocksValidation("MINOR")).toBe(false);
  });
});
