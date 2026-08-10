/**
 * The one rule of the summarising pass that is decidable without a database
 * (CAL-055, §8): *when* a chapter may be summarised at all.
 *
 * Everything else this module does — reading the chapter, composing, calling
 * the injected port, appending a revision, refreshing the part — touches rows,
 * and is asserted end to end against a real PostgreSQL in
 * `test/integration/chapter-summaries.integration.test.ts`, including the two
 * paths that matter most: the status gate refusing a draft, and an answer that
 * fails the schema writing nothing at all.
 */

import { describe, expect, it } from "vitest";

import { SUMMARIZABLE_CHAPTER_STATUSES } from "./summarize";

describe("when a chapter may be summarised", () => {
  // A summary is the memory every later chapter is written against, so
  // summarising a first draft would publish, as settled fact, something the
  // author has not accepted. CAL-125 owns the transition itself; this list is
  // the gate that makes the ordering a rule rather than a convention.
  it("names validated and locked, in the schema's own spelling", () => {
    expect([...SUMMARIZABLE_CHAPTER_STATUSES]).toEqual(["VALIDATED", "LOCKED"]);
  });

  it("excludes every status a chapter passes through before validation", () => {
    for (const status of ["PLANNED", "TO_WRITE", "GENERATING", "FIRST_DRAFT", "TO_REVISE"]) {
      expect(SUMMARIZABLE_CHAPTER_STATUSES as readonly string[]).not.toContain(status);
    }
  });

  // LOCKED is included deliberately, and it is the non-obvious half: a locked
  // chapter is validated *and* frozen, so refusing it would make re-deriving a
  // lost summary impossible on exactly the chapters most worth keeping.
  it("does not treat locking as a reason to refuse", () => {
    expect(SUMMARIZABLE_CHAPTER_STATUSES).toContain("LOCKED");
  });
});
