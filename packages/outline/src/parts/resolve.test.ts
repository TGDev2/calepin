import { describe, expect, it } from "vitest";

import { aPartStructure, aPartStructureInput } from "./fixtures";
import { PART_TIPPING_POINT_CONNECTOR, resolvePartStructure } from "./resolve";
import { type VerifiedPartStructure, verifyPartStructure } from "./verify";

function aVerifiedPartStructure(): VerifiedPartStructure {
  const verification = verifyPartStructure(aPartStructure(), aPartStructureInput());

  if (verification.outcome !== "verified") throw new Error("the fixture no longer verifies");

  return verification.structure;
}

describe("resolvePartStructure", () => {
  it("carries the parts in the answer's own order, under the columns' own names", () => {
    const resolved = resolvePartStructure(aVerifiedPartStructure());

    expect(resolved.parts.map((part) => part.title)).toEqual([
      "Le chantier",
      "Les comptes",
      "La rupture",
      "Ce qui se répare",
    ]);
    expect(resolved.threads.map((thread) => thread.label)).toEqual([
      "La dette de Meida",
      "L'atelier menacé",
      "Le frère disparu",
    ]);
  });

  it("flattens the tipping point behind the connector, without erasing either half", () => {
    const structure = aVerifiedPartStructure();
    const resolved = resolvePartStructure(structure);

    structure.parts.forEach((part, index) => {
      expect(resolved.parts[index]?.tippingPoint).toBe(
        `${part.tippingPoint.event} ${PART_TIPPING_POINT_CONNECTOR} ${part.tippingPoint.irreversibility}`,
      );
    });
  });

  it("resolves each part's thread indexes to the declared labels, in the part's own order", () => {
    const resolved = resolvePartStructure(aVerifiedPartStructure());

    expect(resolved.parts[0]?.threadLabels).toEqual(["La dette de Meida", "Le frère disparu"]);
    expect(resolved.parts[2]?.threadLabels).toEqual([
      "La dette de Meida",
      "L'atelier menacé",
      "Le frère disparu",
    ]);
  });

  it("carries the threads whole — label and promise both survive the resolution", () => {
    const structure = aVerifiedPartStructure();
    const resolved = resolvePartStructure(structure);

    expect(resolved.threads).toEqual(
      structure.threads.map(({ label, narrativePromise }) => ({ label, narrativePromise })),
    );
  });
});
