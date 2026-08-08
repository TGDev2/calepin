import { describe, expect, it } from "vitest";

import {
  isProjectStage,
  PROJECT_STAGE_STATUSES,
  PROJECT_STATUSES,
  projectStageRank,
  type ProjectStatus,
} from "./statuses";
import {
  assertProjectStatusTransition,
  canTransition,
  PROJECT_STATUS_TRANSITIONS,
} from "./transitions";

/**
 * The rule the hand-written table is supposed to encode, restated
 * independently.
 *
 * Two statements of one design, compared over every pair below. Deriving the
 * table from this function instead would make the comparison vacuous, and
 * writing the table alone would leave a typo in one of sixty-two entries with
 * nothing to fail against — the entry that is eventually wrong being the one
 * that lets a project claim to be finished.
 */
function ruleAllows(from: ProjectStatus, to: ProjectStatus): boolean {
  if (from === to) return false;
  // Archiving is available from anywhere, and restoring recomputes, so it lands
  // wherever the graph says.
  if (to === "ARCHIVED" || from === "ARCHIVED") return true;
  if (!isProjectStage(from) || !isProjectStage(to)) return false;

  const back = projectStageRank(to) < projectStageRank(from);
  const oneStepForward = projectStageRank(to) === projectStageRank(from) + 1;

  return back || oneStepForward;
}

/** The hundred ordered pairs, as `it.each` rows. */
const ALL_PAIRS = PROJECT_STATUSES.flatMap((from) =>
  PROJECT_STATUSES.map((to) => ({ from, to, allowed: ruleAllows(from, to) })),
);

const LEGAL = ALL_PAIRS.filter((pair) => pair.allowed);
const ILLEGAL = ALL_PAIRS.filter((pair) => !pair.allowed);

describe("the project status transition table", () => {
  it("covers the ten statuses and nothing else", () => {
    expect(Object.keys(PROJECT_STATUS_TRANSITIONS).sort()).toEqual([...PROJECT_STATUSES].sort());
  });

  // The count is pinned so that a pair silently gaining or losing an edge fails
  // here even if both statements of the rule were edited together.
  it("holds sixty-two of the hundred ordered pairs", () => {
    expect(LEGAL).toHaveLength(62);
    expect(ILLEGAL).toHaveLength(38);
  });

  describe("every allowed transition", () => {
    it.each(LEGAL)("allows $from -> $to", ({ from, to }) => {
      expect(canTransition(from, to)).toBe(true);
      expect(assertProjectStatusTransition(from, to)).toEqual({ ok: true, value: undefined });
    });
  });

  describe("every refused transition", () => {
    it.each(ILLEGAL)("refuses $from -> $to", ({ from, to }) => {
      expect(canTransition(from, to)).toBe(false);

      const refusal = assertProjectStatusTransition(from, to);

      expect(refusal.ok).toBe(false);
      if (refusal.ok) return;

      expect(refusal.error).toMatchObject({
        code: "ILLEGAL_STATUS_TRANSITION",
        category: "conflict",
        retryable: false,
      });
    });
  });

  it("never lets a status transition to itself", () => {
    for (const status of PROJECT_STATUSES) expect(canTransition(status, status)).toBe(false);
  });

  // The property the derivation leans on: the product produces the evidence in
  // order, so one legitimate write advances the answer by one stage and never
  // more. An extra forward edge here would let a graph written behind the
  // machine's back be ratified rather than refused.
  it("gives every stage exactly one forward edge, its successor", () => {
    for (const [index, stage] of PROJECT_STAGE_STATUSES.entries()) {
      const forward = PROJECT_STAGE_STATUSES.filter(
        (other) => projectStageRank(other) > index && canTransition(stage, other),
      );

      expect(forward).toEqual(PROJECT_STAGE_STATUSES.slice(index + 1, index + 2));
    }
  });

  it("lets every stage fall back to any earlier stage", () => {
    for (const [index, stage] of PROJECT_STAGE_STATUSES.entries()) {
      const back = PROJECT_STAGE_STATUSES.filter((other) => canTransition(stage, other));

      expect(back).toEqual([
        ...PROJECT_STAGE_STATUSES.slice(0, index),
        ...PROJECT_STAGE_STATUSES.slice(index + 1, index + 2),
      ]);
    }
  });

  it("reaches ARCHIVED from every status, and every status from ARCHIVED", () => {
    for (const stage of PROJECT_STAGE_STATUSES) {
      expect(canTransition(stage, "ARCHIVED")).toBe(true);
      expect(canTransition("ARCHIVED", stage)).toBe(true);
    }
  });

  // PUBLISHED is the end of the chain, so the only status it may become is
  // ARCHIVED or an earlier stage — a published novel whose chapters are edited
  // again stops being finished, and the column has to be able to say so.
  it("gives PUBLISHED no forward edge but archiving", () => {
    expect([...PROJECT_STATUS_TRANSITIONS.PUBLISHED]).toEqual([
      ...PROJECT_STAGE_STATUSES.filter((stage) => stage !== "PUBLISHED"),
      "ARCHIVED",
    ]);
  });
});
