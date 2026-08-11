import { describe, expect, it } from "vitest";

import { checkNovelIdentityBasis } from "./basis";
import { anIdentity, anIdentityInput, identitySources } from "./fixtures";
import { type IdentitySource, type TracedNovelIdentity } from "./schema";

const sources = identitySources();

/** One field's basis replaced, leaving everything else exactly as it was. */
function withBasis(
  field: "genre" | "tone" | "endingNature",
  basis: { sourceKey: string; quotation: string },
): TracedNovelIdentity {
  const identity = anIdentity();

  return {
    ...identity,
    [field]: {
      value: identity[field].value,
      basis: { ...identity[field].basis, ...basis },
    },
  };
}

describe("checkNovelIdentityBasis", () => {
  it("accepts an identity whose every field quotes a passage the ask carried", () => {
    const report = checkNovelIdentityBasis(anIdentity(), sources);

    expect(report.acceptable).toBe(true);
    expect(report.untraced).toEqual([]);
  });

  it("reads every field — the seven scalars and both halves of each axis", () => {
    const identity = anIdentity();
    const report = checkNovelIdentityBasis(identity, sources);

    expect(report.fields).toBe(7 + identity.thematicAxes.length * 2);
  });

  it("refuses a field naming a source the ask never offered", () => {
    const report = checkNovelIdentityBasis(
      withBasis("genre", { sourceKey: "direction.premise", quotation: "la survie du village" }),
      sources,
    );

    expect(report.acceptable).toBe(false);
    expect(report.untraced).toEqual([{ field: "genre", index: null, reason: "unknown-source" }]);
  });

  it("refuses a quotation that is not in the passage it names", () => {
    const report = checkNovelIdentityBasis(
      withBasis("tone", {
        sourceKey: "analysis.tone",
        quotation: "un ton lyrique et emporté",
      }),
      sources,
    );

    expect(report.acceptable).toBe(false);
    expect(report.untraced).toEqual([
      { field: "tone", index: null, reason: "quotation-not-found" },
    ]);
  });

  it("refuses a quotation found in another passage than the one it names", () => {
    // The words exist in the corpus — in the direction's conflict, not in the
    // analysis's tone. Naming the wrong source is naming no source: the check
    // is per-passage, exactly as CAL-081's is per-field.
    const report = checkNovelIdentityBasis(
      withBasis("tone", { sourceKey: "analysis.tone", quotation: "la survie du village" }),
      sources,
    );

    expect(report.untraced).toEqual([
      { field: "tone", index: null, reason: "quotation-not-found" },
    ]);
  });

  it("names the position of an untraced theme or counter-theme", () => {
    const identity = anIdentity();
    const [first, second] = identity.thematicAxes;

    if (first === undefined || second === undefined) {
      throw new Error("the fixture carries fewer than two axes");
    }

    const report = checkNovelIdentityBasis(
      {
        ...identity,
        thematicAxes: [
          first,
          {
            theme: second.theme,
            counterTheme: {
              value: second.counterTheme.value,
              basis: { ...second.counterTheme.basis, quotation: "ce que le texte ne dit pas" },
            },
          },
        ],
      },
      sources,
    );

    expect(report.untraced).toEqual([
      { field: "counterTheme", index: 1, reason: "quotation-not-found" },
    ]);
  });

  it("reports every untraced field, not just the first", () => {
    const identity = anIdentity();
    const broken: TracedNovelIdentity = {
      ...identity,
      genre: {
        value: identity.genre.value,
        basis: { ...identity.genre.basis, sourceKey: "nowhere" },
      },
      endingNature: {
        value: identity.endingNature.value,
        basis: { ...identity.endingNature.basis, quotation: "une fin heureuse" },
      },
    };

    expect(checkNovelIdentityBasis(broken, sources).untraced).toEqual([
      { field: "genre", index: null, reason: "unknown-source" },
      { field: "endingNature", index: null, reason: "quotation-not-found" },
    ]);
  });

  it("reports which upstreams the answer actually drew on", () => {
    expect(checkNovelIdentityBasis(anIdentity(), sources).citedKinds).toEqual([
      "direction",
      "analysis",
    ]);
  });

  it("reports one upstream when the answer only read one", () => {
    const identity = anIdentity();
    const conflictOnly = { sourceKey: "direction.mainConflict", quotation: "la survie du village" };
    const report = checkNovelIdentityBasis(
      {
        ...identity,
        tone: { value: identity.tone.value, basis: { ...identity.tone.basis, ...conflictOnly } },
        thematicAxes: identity.thematicAxes.map((axis) => ({
          theme: { value: axis.theme.value, basis: { ...axis.theme.basis, ...conflictOnly } },
          counterTheme: axis.counterTheme,
        })),
        centralQuestion: {
          value: identity.centralQuestion.value,
          basis: { ...identity.centralQuestion.basis, ...conflictOnly },
        },
      },
      sources,
    );

    expect(report.acceptable).toBe(true);
    expect(report.citedKinds).toEqual(["direction"]);
  });

  it("matches a quotation the model retyped with different typography", () => {
    // `createVerbatimMatcher` compares word sequences, not characters: an
    // apostrophe the model normalised is not an invention.
    const report = checkNovelIdentityBasis(
      withBasis("genre", {
        sourceKey: "direction.mainConflict",
        quotation: "du village qui l’a prêté",
      }),
      sources,
    );

    expect(report.acceptable).toBe(true);
  });

  it("refuses a quotation stitched together across an ellipsis", () => {
    // A quotation nobody wrote is exactly what the check exists to catch.
    const report = checkNovelIdentityBasis(
      withBasis("genre", {
        sourceKey: "direction.mainConflict",
        quotation: "la fidélité à un serment ancien et le village",
      }),
      sources,
    );

    expect(report.acceptable).toBe(false);
  });

  it("carries no word of the identity or of the corpus in its report", () => {
    const report = checkNovelIdentityBasis(
      withBasis("tone", { sourceKey: "analysis.tone", quotation: "un ton lyrique et emporté" }),
      sources,
    );

    expect(JSON.stringify(report)).not.toMatch(/lyrique|serment|village/);
  });

  it("reads the corpus the ask carried", () => {
    const input = anIdentityInput();
    const asked: readonly IdentitySource[] = input.sources;

    expect(checkNovelIdentityBasis(anIdentity(), asked).acceptable).toBe(true);
  });
});
