/**
 * What a costly operation is made of (CAL-057).
 *
 * The specification requires an estimate before a costly operation, and
 * requires it not to be read off the number of words produced. This file is
 * the reason it cannot be: an operation is declared as a **bundle of mission
 * calls**, and the calls that produce nothing a reader reads — the extraction,
 * the coherence check, the summaries — are in the bundle beside the one that
 * does. Writing a chapter is five calls on two models, and the four that
 * produce no prose carry more than half its price.
 *
 * **This is a consumption profile, not a workflow.** The registry says how many
 * calls of which mission the product bills as one action, and says nothing
 * about when they run, in what order, on what condition, or what is done with
 * their answers — that is the domains' business, in the epics that own it
 * (E09, E11, E13). The AI layer may know what a mission *costs*; it may not
 * know what a chapter *means* (§5.7), and nothing here does.
 *
 * A phase is declared per **unit** so one estimate answers both "write this
 * chapter" and "write the eleven chapters left": the operation names what its
 * unit is, the caller says how many, and `operation-estimate.ts` multiplies.
 */

import type { MissionId } from "./missions";

/**
 * What a phase is for — and the axis that makes the estimate honest.
 *
 * `production` is the call whose answer the reader reads. `analysis` reads what
 * was produced and turns it into something the next call can use — facts,
 * summaries. `control` looks for what is wrong with it. The screen names the
 * three separately, so an author can see that the cost of writing a chapter is
 * not the cost of the prose.
 */
export const OPERATION_PHASE_KINDS = ["production", "analysis", "control"] as const;

export type OperationPhaseKind = (typeof OPERATION_PHASE_KINDS)[number];

/**
 * What the operation's `unitCount` counts. `project` means the operation is
 * whole and happens once — asking for two plans of one project is not a larger
 * operation, it is two of them.
 */
export const OPERATION_UNITS = ["project", "chapter"] as const;

export type OperationUnit = (typeof OPERATION_UNITS)[number];

/** The four operations the specification names as costly. */
export const COSTLY_OPERATION_IDS = [
  "generate-outline",
  "write-chapter",
  "regenerate-chapter",
  "audit-manuscript",
] as const;

export type CostlyOperationId = (typeof COSTLY_OPERATION_IDS)[number];

export interface OperationPhase {
  readonly mission: MissionId;
  readonly kind: OperationPhaseKind;
  /** Calls of this mission per unit of the operation. */
  readonly callsPerUnit: number;
}

export interface CostlyOperationDefinition {
  /** Redundant with the key, and pinned against it by test — as the mission registry is. */
  readonly id: CostlyOperationId;
  readonly unit: OperationUnit;
  readonly phases: readonly OperationPhase[];
}

export type CostlyOperationRegistry = Readonly<
  Record<CostlyOperationId, CostlyOperationDefinition>
>;

export const COSTLY_OPERATION_REGISTRY = {
  /**
   * The plan of the whole novel, built once and then checked: an outline whose
   * parts contradict the bible is worse than none, because everything written
   * afterwards inherits the contradiction. The split comes first (CAL-101) —
   * the parts are the frame the chapter plans hang inside.
   */
  "generate-outline": {
    id: "generate-outline",
    unit: "project",
    phases: [
      { mission: "split-into-parts", kind: "production", callsPerUnit: 1 },
      { mission: "build-chapter-outline", kind: "production", callsPerUnit: 1 },
      { mission: "check-coherence", kind: "control", callsPerUnit: 1 },
    ],
  },

  /**
   * One chapter, end to end — the operation the author performs most, and the
   * one whose real price is least visible. The scene is written, the facts it
   * establishes are extracted so later chapters can be held to them, it is
   * checked against everything already established, and it is summarised at
   * both resolutions so it can be remembered without being re-read (CAL-055).
   *
   * Four of the five calls produce nothing anyone reads, and together they cost
   * more than the one that does. `operation-estimate.test.ts` asserts exactly
   * that against the tariff table, which is what keeps this from being a claim.
   */
  "write-chapter": {
    id: "write-chapter",
    unit: "chapter",
    phases: [
      { mission: "write-scene", kind: "production", callsPerUnit: 1 },
      { mission: "extract-facts", kind: "analysis", callsPerUnit: 1 },
      { mission: "check-coherence", kind: "control", callsPerUnit: 1 },
      { mission: "summarize-chapter", kind: "analysis", callsPerUnit: 1 },
      { mission: "summarize-part", kind: "analysis", callsPerUnit: 1 },
    ],
  },

  /**
   * The same five calls again, and that is the point: a regeneration is a
   * second full pass, not a discount on the first. The facts the old draft
   * established have to be extracted again, the new draft has to be checked
   * again, and both summaries have to be rebuilt — a screen that quoted only
   * the scene would understate a regeneration by more than half, which is
   * precisely the mistake an author repeats until someone shows them the total.
   */
  "regenerate-chapter": {
    id: "regenerate-chapter",
    unit: "chapter",
    phases: [
      { mission: "write-scene", kind: "production", callsPerUnit: 1 },
      { mission: "extract-facts", kind: "analysis", callsPerUnit: 1 },
      { mission: "check-coherence", kind: "control", callsPerUnit: 1 },
      { mission: "summarize-chapter", kind: "analysis", callsPerUnit: 1 },
      { mission: "summarize-part", kind: "analysis", callsPerUnit: 1 },
    ],
  },

  /**
   * The full audit: every chapter checked against everything else, on the most
   * demanding mission of the thirteen. Pure control — it produces nothing and
   * changes nothing — and the operation whose price grows fastest, since its
   * unit is the chapter and a manuscript has as many as it has.
   */
  "audit-manuscript": {
    id: "audit-manuscript",
    unit: "chapter",
    phases: [{ mission: "check-coherence", kind: "control", callsPerUnit: 1 }],
  },
} as const satisfies CostlyOperationRegistry;
