import { describe, expect, it } from "vitest";

import { deriveProjectStatus, type ProjectProgress } from "./progress";
import { PROJECT_STAGE_STATUSES, type ProjectStage, projectStageRank } from "./statuses";
import { canTransition } from "./transitions";

/** A project that has just been created: a row and nothing else. */
const NEW_PROJECT: ProjectProgress = {
  isArchived: false,
  hasSourceText: false,
  isAnalysisValidated: false,
  hasCanonicalDirection: false,
  isBibleValidated: false,
  plannedChapterCount: 0,
  writtenChapterCount: 0,
  validatedChapterCount: 0,
  isPublished: false,
};

/**
 * The evidence each stage adds, in the order the product produces it.
 *
 * This is the product's own sequence written down once — validating a bible
 * comes after choosing a direction, writing comes after a plan exists — and it
 * is what the one-step property below is proved against. The counts move
 * together with the plan: three chapters are outlined, then written, then
 * validated.
 */
const EVIDENCE_STEPS: readonly {
  readonly stage: ProjectStage;
  readonly evidence: Partial<ProjectProgress>;
}[] = [
  { stage: "DRAFT", evidence: {} },
  { stage: "ANALYSIS_IN_PROGRESS", evidence: { hasSourceText: true } },
  { stage: "DIRECTION_TO_CHOOSE", evidence: { isAnalysisValidated: true } },
  { stage: "BIBLE_TO_VALIDATE", evidence: { hasCanonicalDirection: true } },
  { stage: "OUTLINE_IN_PROGRESS", evidence: { isBibleValidated: true, plannedChapterCount: 3 } },
  { stage: "WRITING_IN_PROGRESS", evidence: { writtenChapterCount: 1 } },
  { stage: "REVISION", evidence: { writtenChapterCount: 3 } },
  { stage: "COMPLETED", evidence: { validatedChapterCount: 3 } },
  { stage: "PUBLISHED", evidence: { isPublished: true } },
];

/** The evidence a project holds once it has reached `stage` by that sequence. */
function progressAt(stage: ProjectStage): ProjectProgress {
  const upTo = EVIDENCE_STEPS.slice(0, projectStageRank(stage) + 1);

  return upTo.reduce<ProjectProgress>(
    (progress, step) => ({ ...progress, ...step.evidence }),
    NEW_PROJECT,
  );
}

describe("deriving a project status from its rows", () => {
  it("answers DRAFT for a project that holds nothing but its own row", () => {
    expect(deriveProjectStatus(NEW_PROJECT)).toBe("DRAFT");
  });

  describe("each stage, from the evidence the product produces for it", () => {
    it.each(PROJECT_STAGE_STATUSES)("reaches %s", (stage) => {
      expect(deriveProjectStatus(progressAt(stage))).toBe(stage);
    });
  });

  // The property the transition table leans on. Every legitimate write in the
  // product adds one of these facts to the ones already there, so the derivation
  // moves by exactly one stage and the table's single forward edge is never in
  // the way.
  it("moves exactly one stage forward per step of the product's own sequence", () => {
    for (const [index, step] of EVIDENCE_STEPS.entries()) {
      const previous = EVIDENCE_STEPS[index - 1];
      if (previous === undefined) continue;

      const before = deriveProjectStatus(progressAt(previous.stage));
      const after = deriveProjectStatus(progressAt(step.stage));

      expect(after).toBe(step.stage);
      expect(canTransition(before, after)).toBe(true);
    }
  });

  it("archives whatever the rows say, and says nothing else while it does", () => {
    for (const stage of PROJECT_STAGE_STATUSES) {
      expect(deriveProjectStatus({ ...progressAt(stage), isArchived: true })).toBe("ARCHIVED");
    }
  });

  it("returns to the stage the rows support when the project is restored", () => {
    const archived: ProjectProgress = { ...progressAt("REVISION"), isArchived: true };

    expect(deriveProjectStatus(archived)).toBe("ARCHIVED");
    expect(deriveProjectStatus({ ...archived, isArchived: false })).toBe("REVISION");
  });

  describe("the furthest stage reached, not the first one missing", () => {
    // The case that decides the shape of the function: an author reopens the
    // bible of a finished novel. The manuscript has not gone anywhere, and a
    // status that fell to BIBLE_TO_VALIDATE would be describing the edit rather
    // than the novel — then leap five stages back the moment it was re-validated,
    // which the transition table would refuse outright.
    it("keeps a finished novel finished while its bible is being re-validated", () => {
      const reopened: ProjectProgress = { ...progressAt("COMPLETED"), isBibleValidated: false };

      expect(deriveProjectStatus(reopened)).toBe("COMPLETED");
      expect(deriveProjectStatus({ ...reopened, isBibleValidated: true })).toBe("COMPLETED");
    });

    it("keeps writing in progress while a single chapter is un-validated", () => {
      const undone: ProjectProgress = { ...progressAt("COMPLETED"), validatedChapterCount: 2 };

      expect(deriveProjectStatus(undone)).toBe("REVISION");
    });
  });

  describe("regressions, which remove several stages at once", () => {
    // Deleting a bible cascades to the outline, its chapters and their
    // revisions, so four facts disappear in one statement. The derivation has to
    // follow it down, and the table has to allow the fall.
    it("falls back several stages when a bible is deleted", () => {
      const finished = progressAt("COMPLETED");
      const withoutBible: ProjectProgress = {
        ...finished,
        isBibleValidated: false,
        plannedChapterCount: 0,
        writtenChapterCount: 0,
        validatedChapterCount: 0,
      };

      expect(deriveProjectStatus(finished)).toBe("COMPLETED");
      expect(deriveProjectStatus(withoutBible)).toBe("BIBLE_TO_VALIDATE");
      expect(canTransition("COMPLETED", "BIBLE_TO_VALIDATE")).toBe(true);
    });

    it("returns a project to DRAFT when every trace of progress is removed", () => {
      expect(deriveProjectStatus({ ...progressAt("PUBLISHED"), ...NEW_PROJECT })).toBe("DRAFT");
      expect(canTransition("PUBLISHED", "DRAFT")).toBe(true);
    });
  });

  describe("the evidence states no write path can produce", () => {
    // These are what the transition table exists to catch: rows written behind
    // the machine's back — a fixture, an import, a bug — where a fact appeared
    // without the ones the product would have produced before it. The derivation
    // answers honestly; refusing the jump is `refreshProjectStatus`'s job, and
    // `reconcileProjectStatus` is the way back.
    it("reports a stage the stored status cannot legally reach", () => {
      const outOfOrder: ProjectProgress = { ...NEW_PROJECT, isBibleValidated: true };

      expect(deriveProjectStatus(outOfOrder)).toBe("OUTLINE_IN_PROGRESS");
      expect(canTransition("DRAFT", "OUTLINE_IN_PROGRESS")).toBe(false);
    });

    it("reports a novel published without a chapter, which nothing may ratify", () => {
      const published: ProjectProgress = {
        ...progressAt("WRITING_IN_PROGRESS"),
        isPublished: true,
      };

      expect(deriveProjectStatus(published)).toBe("PUBLISHED");
      expect(canTransition("WRITING_IN_PROGRESS", "PUBLISHED")).toBe(false);
    });
  });

  describe("counts, where the boundaries are", () => {
    it("does not call an empty plan fully written", () => {
      const empty: ProjectProgress = {
        ...progressAt("OUTLINE_IN_PROGRESS"),
        plannedChapterCount: 0,
      };

      expect(deriveProjectStatus(empty)).toBe("OUTLINE_IN_PROGRESS");
    });

    it("enters revision only once the last planned chapter has text", () => {
      const outlined = progressAt("OUTLINE_IN_PROGRESS");

      expect(deriveProjectStatus({ ...outlined, writtenChapterCount: 2 })).toBe(
        "WRITING_IN_PROGRESS",
      );
      expect(deriveProjectStatus({ ...outlined, writtenChapterCount: 3 })).toBe("REVISION");
    });

    // A plan that grew after the manuscript was finished is not finished any
    // more, and the derivation says so without anyone having to remember to.
    it("leaves a finished novel when a chapter is added to its plan", () => {
      const grown: ProjectProgress = { ...progressAt("COMPLETED"), plannedChapterCount: 4 };

      expect(deriveProjectStatus(grown)).toBe("WRITING_IN_PROGRESS");
    });
  });
});
