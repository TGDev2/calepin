import { describe, expect, it } from "vitest";

import { anIdentity } from "./fixtures";
import { resolveNovelIdentity } from "./resolve";

const settings = { targetAudience: "Adultes, lecteurs de récits sombres", targetWordCount: 70_000 };

describe("resolveNovelIdentity", () => {
  it("produces the specification's eleven fields, in its order", () => {
    expect(Object.keys(resolveNovelIdentity(anIdentity(), settings))).toEqual([
      "workingTitle",
      "genre",
      "subGenre",
      "targetAudience",
      "targetWordCount",
      "tone",
      "narrativePromise",
      "themes",
      "counterThemes",
      "centralQuestion",
      "endingNature",
    ]);
  });

  it("takes the readership and the length from the project, never from the answer", () => {
    const resolved = resolveNovelIdentity(anIdentity(), settings);

    expect(resolved.targetAudience).toBe(settings.targetAudience);
    expect(resolved.targetWordCount).toBe(settings.targetWordCount);
  });

  it("strips the bases — traceability stays on the answer that carried it", () => {
    const resolved = resolveNovelIdentity(anIdentity(), settings);

    expect(JSON.stringify(resolved)).not.toMatch(/sourceKey|quotation|justification/);
  });

  it("projects the axes onto the two columns, in step", () => {
    const identity = anIdentity();
    const resolved = resolveNovelIdentity(identity, settings);

    expect(resolved.themes).toEqual(identity.thematicAxes.map((axis) => axis.theme.value));
    expect(resolved.counterThemes).toEqual(
      identity.thematicAxes.map((axis) => axis.counterTheme.value),
    );
    expect(resolved.counterThemes).toHaveLength(resolved.themes.length);
  });

  it("carries each generated field through unchanged", () => {
    const identity = anIdentity();
    const resolved = resolveNovelIdentity(identity, settings);

    expect(resolved.workingTitle).toBe(identity.workingTitle.value);
    expect(resolved.genre).toBe(identity.genre.value);
    expect(resolved.subGenre).toBe(identity.subGenre.value);
    expect(resolved.tone).toBe(identity.tone.value);
    expect(resolved.narrativePromise).toBe(identity.narrativePromise.value);
    expect(resolved.centralQuestion).toBe(identity.centralQuestion.value);
    expect(resolved.endingNature).toBe(identity.endingNature.value);
  });
});
