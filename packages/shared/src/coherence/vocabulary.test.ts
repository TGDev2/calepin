import { describe, expect, it } from "vitest";

import {
  BIBLE_COHERENCE_CHECKS,
  BIBLE_DETERMINISTIC_CHECKS,
  BIBLE_MODEL_CHECKS,
  isCoherenceCheckId,
  QUALITY_ISSUE_CATEGORIES,
  QUALITY_ISSUE_SEVERITIES,
  QUALITY_ISSUE_STATUSES,
} from "./vocabulary";

describe("the check identifiers", () => {
  it("splits into the calculable ones and the model-backed ones, with nothing in both", () => {
    const overlap = BIBLE_DETERMINISTIC_CHECKS.filter((id) =>
      (BIBLE_MODEL_CHECKS as readonly string[]).includes(id),
    );

    expect(overlap).toEqual([]);
  });

  it("covers the whole bible suite with the two halves — a run closes exactly what it recomputed", () => {
    expect([...BIBLE_COHERENCE_CHECKS].sort()).toEqual(
      [...BIBLE_DETERMINISTIC_CHECKS, ...BIBLE_MODEL_CHECKS].sort(),
    );
  });

  it("declares every identifier once", () => {
    expect(new Set(BIBLE_COHERENCE_CHECKS).size).toBe(BIBLE_COHERENCE_CHECKS.length);
  });

  it("names every check for the subject it reads, so E13's own ids cannot collide", () => {
    for (const id of BIBLE_COHERENCE_CHECKS) {
      expect(id.startsWith("bible-")).toBe(true);
      expect(id).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);
    }
  });

  it("recognises its own identifiers and refuses anything else", () => {
    expect(isCoherenceCheckId("bible-canon-fact-collision")).toBe(true);
    expect(isCoherenceCheckId("bible-something-nobody-declared")).toBe(false);
    expect(isCoherenceCheckId("")).toBe(false);
  });
});

describe("the enum mirrors", () => {
  // `prisma/schema.test.ts` pins each of these against its Prisma enum. What is
  // asserted here is only what that pin cannot see: that the arrays hold no
  // duplicate and that the severity order is the one a report is ranked by.
  it("holds each member once", () => {
    expect(new Set(QUALITY_ISSUE_CATEGORIES).size).toBe(QUALITY_ISSUE_CATEGORIES.length);
    expect(new Set(QUALITY_ISSUE_SEVERITIES).size).toBe(QUALITY_ISSUE_SEVERITIES.length);
    expect(new Set(QUALITY_ISSUE_STATUSES).size).toBe(QUALITY_ISSUE_STATUSES.length);
  });

  it("ranks the severities most severe first", () => {
    expect(QUALITY_ISSUE_SEVERITIES).toEqual(["CRITICAL", "MAJOR", "MINOR"]);
  });
});
