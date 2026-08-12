import { describe, expect, it } from "vitest";

import { aPartStructure, aPartStructureInput } from "./fixtures";
import { isVerifiedPartStructure, verifyPartStructure } from "./verify";

describe("verifyPartStructure", () => {
  it("verifies a clean answer and brands it", () => {
    const verification = verifyPartStructure(aPartStructure(), aPartStructureInput());

    expect(verification.outcome).toBe("verified");
    if (verification.outcome !== "verified") return;
    expect(isVerifiedPartStructure(verification.structure)).toBe(true);
    expect(verification.report.acceptable).toBe(true);
    expect(verification.report.parts).toBe(4);
  });

  it("refuses whole on a hard defect, with the report as the answer", () => {
    // The same answer, asked for a novel a third the length: the count gate
    // is derived from the ask, so only the ask has to move for the verdict to.
    const input = { ...aPartStructureInput(), targetWordCount: 20_000 };

    const verification = verifyPartStructure(aPartStructure(), input);

    expect(verification.outcome).toBe("refused");
    if (verification.outcome !== "refused") return;
    expect(verification.report.defects.map((defect) => defect.kind)).toContain(
      "part-count-out-of-range",
    );
  });

  it("verifies an answer whose only findings are advisories, and reports them", () => {
    const structure = aPartStructure();
    const firstPart = structure.parts[0];
    const thirdPart = structure.parts[2];
    if (firstPart === undefined || thirdPart === undefined) {
      throw new Error("the fixture holds no such part");
    }
    firstPart.threadIndexes = [0];
    thirdPart.threadIndexes = [0, 1];

    const verification = verifyPartStructure(structure, aPartStructureInput());

    expect(verification.outcome).toBe("verified");
    if (verification.outcome !== "verified") return;
    expect(verification.report.advisories).toContainEqual({
      kind: "single-part-thread",
      threadIndex: 2,
      partIndex: 3,
    });
  });

  it("does not let the brand survive serialisation", () => {
    const verification = verifyPartStructure(aPartStructure(), aPartStructureInput());

    expect(verification.outcome).toBe("verified");
    if (verification.outcome !== "verified") return;
    expect(isVerifiedPartStructure(JSON.parse(JSON.stringify(verification.structure)))).toBe(false);
  });

  it("throws rather than certify a structure the schema no longer accepts", () => {
    // An empty title passes the calculable checks — `sameWords` matches
    // nothing against nothing — but is not a part structure, and the re-parse
    // before minting is what notices.
    const structure = aPartStructure();
    const firstPart = structure.parts[0];
    if (firstPart === undefined) throw new Error("the fixture holds no part");
    firstPart.title = "";

    expect(() => verifyPartStructure(structure, aPartStructureInput())).toThrow(/no longer parses/);
  });
});
