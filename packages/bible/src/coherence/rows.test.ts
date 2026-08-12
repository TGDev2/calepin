import { describe, expect, it } from "vitest";

import { aContradictionsAnswer, aContradictionsInput } from "./fixtures";
import { resolveBibleContradictions } from "./rows";
import { verifyBibleContradictions } from "./verify";

const IDS = {
  factIds: ["fact-alive", "fact-buried", "fact-warden"],
  worldRuleIds: ["rule-road", "rule-pass"],
};

function verified() {
  return verifyBibleContradictions(aContradictionsAnswer(), aContradictionsInput()).contradictions;
}

describe("resolveBibleContradictions", () => {
  it("turns each pair into a blocking finding under its own check", () => {
    const findings = resolveBibleContradictions(verified(), IDS);

    expect(findings.map((finding) => finding.checkId)).toEqual([
      "bible-opposed-canon-facts",
      "bible-contradictory-world-rules",
    ]);
    expect(findings.every((finding) => finding.severity === "CRITICAL")).toBe(true);
    expect(findings.every((finding) => finding.category === "FACTUAL_CONTINUITY")).toBe(true);
  });

  it("resolves the model's indexes into row identifiers — never the model's own", () => {
    const [facts, rules] = resolveBibleContradictions(verified(), IDS);

    expect(facts?.anchor).toEqual(["fact:fact-alive", "fact:fact-buried"]);
    expect(rules?.anchor).toEqual(["rule:rule-road", "rule:rule-pass"]);
  });

  it("carries the model's own argument and correction through unchanged", () => {
    const answer = aContradictionsAnswer();
    const [finding] = resolveBibleContradictions(verified(), IDS);

    expect(finding?.explanation).toBe(answer.opposedFacts[0]?.explanation);
    expect(finding?.proposedFix).toBe(answer.opposedFacts[0]?.proposedFix);
  });

  it("refuses identifiers that do not line up with the ask that was sent", () => {
    // The verifier already dropped every out-of-range pair, so arriving here
    // means the caller offered a list of a different length — a bug, and a
    // throw rather than a silently truncated finding (§7).
    expect(() =>
      resolveBibleContradictions(verified(), { factIds: ["fact-alive"], worldRuleIds: [] }),
    ).toThrow();
  });

  it("returns nothing for an answer that found nothing", () => {
    const nothing = verifyBibleContradictions(
      { opposedFacts: [], contradictoryRules: [] },
      aContradictionsInput(),
    ).contradictions;

    expect(resolveBibleContradictions(nothing, IDS)).toEqual([]);
  });
});
