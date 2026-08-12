import { describe, expect, it } from "vitest";

import { describeOneSidedRelationship, describeOneSidedRelationshipFix } from "../copy";
import { aBibleContent, NORA, VICTOR } from "../fixtures";
import { type BibleContentRows, buildBibleCoherenceSubject } from "../subject";
import { checkRelationshipSymmetry } from "./relationships";

function findings(content: BibleContentRows) {
  return checkRelationshipSymmetry(buildBibleCoherenceSubject(content));
}

describe("checkRelationshipSymmetry", () => {
  it("says nothing about a tie both characters declare", () => {
    expect(findings(aBibleContent())).toEqual([]);
  });

  it("reports a tie only one of the two declares, and names both", () => {
    const content = aBibleContent();
    const broken: BibleContentRows = {
      ...content,
      relationships: content.relationships.filter(
        (relationship) => relationship.fromCharacterId !== VICTOR,
      ),
    };

    const [finding, ...rest] = findings(broken);

    expect(rest).toEqual([]);
    expect(finding?.checkId).toBe("bible-relationship-symmetry");
    expect([...(finding?.anchor ?? [])].sort()).toEqual(
      [`character:${NORA}`, `character:${VICTOR}`].sort(),
    );
    expect(finding?.explanation).toBe(describeOneSidedRelationship("Nora", "Victor"));
    expect(finding?.proposedFix).toBe(describeOneSidedRelationshipFix("Nora", "Victor"));
  });

  it("never blocks a validation on it — a one-sided tie is often the story", () => {
    const content = aBibleContent();
    const broken: BibleContentRows = {
      ...content,
      relationships: content.relationships.filter(
        (relationship) => relationship.fromCharacterId !== VICTOR,
      ),
    };

    expect(findings(broken).every((finding) => finding.severity === "MAJOR")).toBe(true);
  });

  it("says nothing about a pair whose two sides declare different kinds of tie", () => {
    // CAL-091 calls that `divergent`, and a difference between what two people
    // hold about each other is the substance of a relationship rather than a
    // defect in it. Reporting it would train the author to dismiss the check.
    const content = aBibleContent();
    const divergent: BibleContentRows = {
      ...content,
      relationships: content.relationships.map((relationship) =>
        relationship.fromCharacterId === VICTOR
          ? { ...relationship, type: "RIVALRY" as const }
          : relationship,
      ),
    };

    expect(findings(divergent)).toEqual([]);
  });

  it("still reports one missing reciprocity when the declared side has two ties", () => {
    // The anchor is the pair, not the edges: adding a second link in the same
    // direction is not a second missing reciprocity, and the author's decision
    // about it should survive that edit.
    const content = aBibleContent();
    const broken: BibleContentRows = {
      ...content,
      relationships: [
        ...content.relationships.filter((relationship) => relationship.fromCharacterId !== VICTOR),
        {
          id: "relation-nora-victor-second",
          fromCharacterId: NORA,
          toCharacterId: VICTOR,
          type: "FAMILY",
          label: "une cousine éloignée",
          description: null,
        },
      ],
    };

    expect(findings(broken)).toHaveLength(1);
  });

  it("says nothing when the cast has no ties at all", () => {
    expect(findings({ ...aBibleContent(), relationships: [] })).toEqual([]);
  });
});
