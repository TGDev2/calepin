import { describe, expect, it } from "vitest";

import { aChapterOutlineBatch, aChapterOutlineBatchInput } from "./fixtures";
import { CHAPTER_REVELATION_CONNECTOR, resolveChapterOutlineBatch } from "./resolve";
import { type VerifiedChapterOutlineBatch, verifyChapterOutlineBatch } from "./verify";

function aVerifiedBatch(): VerifiedChapterOutlineBatch {
  const verification = verifyChapterOutlineBatch(
    aChapterOutlineBatch(),
    aChapterOutlineBatchInput(),
  );

  if (verification.outcome !== "verified") throw new Error("the fixture batch was refused");

  return verification.batch;
}

describe("resolveChapterOutlineBatch", () => {
  it("resolves the column values in the answer's own reading order", () => {
    const resolved = resolveChapterOutlineBatch(aVerifiedBatch(), aChapterOutlineBatchInput());

    expect(resolved.chapters.map((chapter) => chapter.workingTitle)).toEqual([
      "Les archives",
      "L'hypothèque",
      "La garantie",
    ]);
    const first = resolved.chapters[0];
    if (first === undefined) throw new Error("nothing resolved");
    expect(first.periodStartDay).toBe(31);
    expect(first.periodEndDay).toBe(33);
    expect(first.periodPrecision).toBe("DAY");
    expect(first.dramaticFunction).not.toBe("");
    expect(first.consequence).not.toBe("");
  });

  it("flattens the revelation behind the connector, and stores no position", () => {
    const resolved = resolveChapterOutlineBatch(aVerifiedBatch(), aChapterOutlineBatchInput());
    const first = resolved.chapters[0];
    const second = resolved.chapters[1];
    if (first === undefined || second === undefined) throw new Error("nothing resolved");

    expect(first.revelation).toBe(
      `La vente de l'atelier était déjà engagée avant le départ de Sauveur. ${CHAPTER_REVELATION_CONNECTOR} La date portée sous la signature découverte dans « La signature ».`,
    );
    expect(second.revelation).toBeNull();
    // The preparing reference served the check and stops there: a stored
    // position is rewritten by every move (the orderKey doctrine).
    for (const chapter of resolved.chapters) {
      expect(Object.keys(chapter)).not.toContain("preparedByBatchChapterIndex");
      expect(Object.keys(chapter)).not.toContain("preparedByPrecedingChapterIndex");
    }
  });

  it("writes names back in the ask's spelling, never the model's echo", () => {
    const batch = aChapterOutlineBatch();
    const first = batch.chapters[0];
    if (first === undefined) throw new Error("the fixture holds no chapter");
    first.focalCharacterName = "MEIDA";
    first.presentCharacterNames = ["MEIDA", "horace ferrand"];
    first.placeName = "L'ATELIER DES FERRAND";

    const verification = verifyChapterOutlineBatch(batch, aChapterOutlineBatchInput());
    if (verification.outcome !== "verified") throw new Error("the variant batch was refused");

    const resolved = resolveChapterOutlineBatch(verification.batch, aChapterOutlineBatchInput());
    const resolvedFirst = resolved.chapters[0];
    if (resolvedFirst === undefined) throw new Error("nothing resolved");

    expect(resolvedFirst.focalCharacterName).toBe("Meida");
    expect(resolvedFirst.presentCharacterNames).toEqual(["Meida", "Horace Ferrand"]);
    expect(resolvedFirst.placeName).toBe("L'atelier des Ferrand");
  });

  it("hands back the ask's own fact ids, in the chapter's citation order", () => {
    const resolved = resolveChapterOutlineBatch(aVerifiedBatch(), aChapterOutlineBatchInput());

    expect(resolved.chapters.map((chapter) => chapter.factIds)).toEqual([
      ["fact_1"],
      ["fact_2", "fact_3"],
      ["fact_1", "fact_2"],
    ]);
  });

  it("resolves the three action lists to the ask's thread labels", () => {
    const resolved = resolveChapterOutlineBatch(aVerifiedBatch(), aChapterOutlineBatchInput());
    const second = resolved.chapters[1];
    const third = resolved.chapters[2];
    if (second === undefined || third === undefined) throw new Error("nothing resolved");

    expect(second.opensThreadLabels).toEqual(["L'atelier menacé"]);
    expect(second.continuesThreadLabels).toEqual([]);
    expect(second.closesThreadLabels).toEqual([]);
    expect(third.continuesThreadLabels).toEqual(["La dette de Meida", "L'atelier menacé"]);
  });

  it("throws on a reference the ask cannot resolve — a programming error, not a condition", () => {
    const verified = aVerifiedBatch();
    const input = aChapterOutlineBatchInput();
    input.canonFacts = input.canonFacts.slice(0, 1);

    expect(() => resolveChapterOutlineBatch(verified, input)).toThrow(
      /names a fact the ask does not offer/,
    );
  });
});
