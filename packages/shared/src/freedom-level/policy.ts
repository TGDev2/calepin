/**
 * What each freedom level actually permits (CAL-044) — the table the whole
 * feature is, and the only place the three levels differ.
 *
 * Everything else in this module is derived from it: the constraint clauses a
 * mission is held to (`./constraints`), the compliance check a generated
 * artefact is measured against (`./compliance`), and the sentence the author
 * reads in the wizard (`./copy`). One table, so the promise made on screen and
 * the rule enforced downstream cannot drift apart.
 *
 * **The three invariants the table has to satisfy** — asserted in
 * `./policy.test.ts`, not just described here:
 *
 * 1. *Monotone.* No dimension is treated more strictly at a higher level than
 *    at a lower one. A level is a ceiling, and a ceiling that dips in the
 *    middle is not one.
 * 2. *Strictly increasing.* Each adjacent pair differs on at least one
 *    dimension. Two levels that permit the same thing are one level with two
 *    names, and the whole setting would be decoration.
 * 3. *`themes` is the floor.* Preserved at every level, `HIGH` included —
 *    which is what makes "réinterprétation autorisée tant que les thèmes
 *    essentiels sont conservés" structural rather than advisory.
 */

import {
  type DimensionTreatment,
  SOURCE_DIMENSIONS,
  type SourceDimension,
  treatmentRank,
} from "./dimensions";
import type { FreedomLevel } from "./levels";

export interface FreedomLevelPolicy {
  readonly level: FreedomLevel;
  readonly treatments: Readonly<Record<SourceDimension, DimensionTreatment>>;
}

/**
 * `LOW` — the novel prolongs the source text rather than rewriting it. Only
 * the two dimensions a short text cannot supply enough of are opened, and only
 * to `extend`: a novel needs more people and more places than a nouvelle, and
 * refusing that would not produce fidelity, it would produce a text that
 * cannot reach novel length at all.
 */
const LOW_POLICY: FreedomLevelPolicy = {
  level: "LOW",
  treatments: {
    premise: "preserve",
    "main-conflict": "preserve",
    "narrative-promise": "preserve",
    themes: "preserve",
    protagonist: "preserve",
    "secondary-characters": "extend",
    setting: "extend",
    tone: "preserve",
    "point-of-view": "preserve",
    ending: "preserve",
  },
};

/**
 * `BALANCED` — the core is kept and the rest is genuinely opened. The core is
 * the four dimensions that decide what story this is: its premise, its central
 * conflict, its themes and the promise it makes a reader. The point of view
 * and the ending are the two a nouvelle most often has to give up to become a
 * novel — a first-person vignette rarely holds three hundred pages, and a
 * short text's ending rarely earns them.
 */
const BALANCED_POLICY: FreedomLevelPolicy = {
  level: "BALANCED",
  treatments: {
    premise: "preserve",
    "main-conflict": "preserve",
    "narrative-promise": "preserve",
    themes: "preserve",
    protagonist: "extend",
    "secondary-characters": "extend",
    setting: "extend",
    tone: "extend",
    "point-of-view": "reinterpret",
    ending: "reinterpret",
  },
};

/**
 * `HIGH` — reinterpretation, with two floors rather than one.
 *
 * `themes` is the floor the user's own wording sets. `narrative-promise` is
 * `extend` rather than `reinterpret` because CAL-079's brief already forbids
 * betraying the source's emotional promise *at every level* — that is a
 * standing quality bar of the product, not something a freedom level is
 * entitled to switch off. Every other dimension is free.
 */
const HIGH_POLICY: FreedomLevelPolicy = {
  level: "HIGH",
  treatments: {
    premise: "reinterpret",
    "main-conflict": "reinterpret",
    "narrative-promise": "extend",
    themes: "preserve",
    protagonist: "reinterpret",
    "secondary-characters": "reinterpret",
    setting: "reinterpret",
    tone: "reinterpret",
    "point-of-view": "reinterpret",
    ending: "reinterpret",
  },
};

export const FREEDOM_LEVEL_POLICIES: Readonly<Record<FreedomLevel, FreedomLevelPolicy>> = {
  LOW: LOW_POLICY,
  BALANCED: BALANCED_POLICY,
  HIGH: HIGH_POLICY,
};

export function freedomLevelPolicy(level: FreedomLevel): FreedomLevelPolicy {
  return FREEDOM_LEVEL_POLICIES[level];
}

export function treatmentFor(level: FreedomLevel, dimension: SourceDimension): DimensionTreatment {
  return FREEDOM_LEVEL_POLICIES[level].treatments[dimension];
}

/** The dimensions a level treats a given way, in `SOURCE_DIMENSIONS` order. */
export function dimensionsTreatedAs(
  level: FreedomLevel,
  treatment: DimensionTreatment,
): readonly SourceDimension[] {
  return SOURCE_DIMENSIONS.filter((dimension) => treatmentFor(level, dimension) === treatment);
}

/**
 * How far from the source text a level lets the novel travel, as one number:
 * the sum of its treatment ranks over the ten dimensions. `LOW` scores 2,
 * `BALANCED` 8, `HIGH` 17.
 *
 * This is what makes CAL-044's acceptance criterion — "`LOW` produces
 * directions measurably closer to the source than `HIGH`" — arithmetic rather
 * than a matter of opinion, and checkable before a single model call exists.
 * `sourceDeparture` in `./compliance` scores a *generated* artefact on the
 * same scale, so the budget and the measurement are the same function.
 *
 * It is a measure, never the gate: the gate is per-dimension
 * (`checkFreedomCompliance`), because a budget alone would let a direction
 * trade a preserved theme for a preserved setting and still come out even.
 */
export function sourceDepartureBudget(level: FreedomLevel): number {
  return SOURCE_DIMENSIONS.reduce(
    (total, dimension) => total + treatmentRank(treatmentFor(level, dimension)),
    0,
  );
}
