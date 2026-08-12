import { describe, expect, it } from "vitest";

import { aChapterOutlineBatch, aChapterOutlineBatchInput } from "./fixtures";
import type { PlannedChapter } from "./schema";
import { isVerifiedChapterOutlineBatch, verifyChapterOutlineBatch } from "./verify";

function firstChapterOf(batch: { chapters: PlannedChapter[] }): PlannedChapter {
  const chapter = batch.chapters[0];

  if (chapter === undefined) throw new Error("the fixture holds no chapter");

  return chapter;
}

describe("verifyChapterOutlineBatch", () => {
  it("verifies the fixture batch and brands it", () => {
    const verification = verifyChapterOutlineBatch(
      aChapterOutlineBatch(),
      aChapterOutlineBatchInput(),
    );

    if (verification.outcome !== "verified") throw new Error("the fixture batch was refused");
    expect(isVerifiedChapterOutlineBatch(verification.batch)).toBe(true);
    expect(verification.report.acceptable).toBe(true);
  });

  it("refuses the batch whole on a defect, and hands the report back", () => {
    const batch = aChapterOutlineBatch();
    firstChapterOf(batch).placeName = "Nulle part";

    const verification = verifyChapterOutlineBatch(batch, aChapterOutlineBatchInput());

    if (verification.outcome !== "refused") throw new Error("the defect did not refuse");
    expect(verification.report.defects).toContainEqual({ kind: "unknown-place", chapterIndex: 0 });
    expect(isVerifiedChapterOutlineBatch(batch)).toBe(false);
  });

  it("verifies a batch with advisories, and reports them beside the brand", () => {
    const batch = aChapterOutlineBatch();
    const [first, second] = batch.chapters;
    if (first === undefined || second === undefined) throw new Error("the fixture is short");
    second.immediateGoal = first.immediateGoal;

    const verification = verifyChapterOutlineBatch(batch, aChapterOutlineBatchInput());

    if (verification.outcome !== "verified") throw new Error("an advisory refused the batch");
    expect(verification.report.advisories).not.toEqual([]);
  });

  it("does not let the brand survive serialisation", () => {
    const verification = verifyChapterOutlineBatch(
      aChapterOutlineBatch(),
      aChapterOutlineBatchInput(),
    );

    if (verification.outcome !== "verified") throw new Error("the fixture batch was refused");

    const revived: unknown = JSON.parse(JSON.stringify(verification.batch));

    expect(isVerifiedChapterOutlineBatch(revived)).toBe(false);
  });

  it("throws rather than certify a batch the schema no longer accepts", () => {
    // An empty working title passes the calculable checks — `sameWords`
    // matches nothing against nothing — but is not a chapter plan, and the
    // re-parse before minting is what notices.
    const batch = aChapterOutlineBatch();
    firstChapterOf(batch).workingTitle = "";

    expect(() => verifyChapterOutlineBatch(batch, aChapterOutlineBatchInput())).toThrow(
      /no longer parses/,
    );
  });
});
