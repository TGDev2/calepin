/**
 * The obsolescence report, in French (CAL-046).
 *
 * `@calepin/shared/obsolescence` answers in stage names and reason codes,
 * because a package holds no French (CLAUDE.md §1) and because the rule has to
 * be testable without a sentence in the way. This is where the answer becomes
 * something an author reads — the `project-status-label.ts` convention, one
 * screen along.
 *
 * **The wording never says "obsolete", flatly.** The report is about provenance:
 * a stage was produced from a text that has since changed. Whether that makes it
 * wrong is a literary judgement nothing here is entitled to make, and a screen
 * that announced a bible was *invalid* would be pushing the author toward
 * discarding work the product deliberately refuses to discard for them.
 */

import type {
  DownstreamStage,
  ObsolescenceReason,
  StageObsolescence,
} from "@calepin/shared/obsolescence";

/**
 * One label per stage, in the chain's own order. A `Record` keyed by the union,
 * so a stage added to the chain without a label is a compile error rather than
 * a blank line on screen.
 */
export const DOWNSTREAM_STAGE_LABELS: Record<DownstreamStage, string> = {
  analysis: "L'analyse du texte source",
  direction: "Les directions romanesques",
  bible: "La bible narrative",
  outline: "Le plan",
  chapters: "Les chapitres",
};

/** Why a stage is in doubt, as a clause that follows its label. */
export const OBSOLESCENCE_REASON_LABELS: Record<ObsolescenceReason, string> = {
  "source-text-changed": "produit à partir d'une version antérieure du texte source",
  "upstream-obsolete": "construit sur une étape que cette modification touche déjà",
};

/**
 * What a stage counts, when counting it says something.
 *
 * `null` for the bible and the plan: a project holds exactly one of each, so
 * "1 bible sur 1" is noise. The two that can be partly behind — sections and
 * chapters — are the two worth a number, and "4 chapitres sur 12" is the whole
 * reason the rule carries counts rather than booleans.
 */
const DOWNSTREAM_STAGE_UNITS: Record<DownstreamStage, { one: string; many: string } | null> = {
  analysis: { one: "section", many: "sections" },
  direction: { one: "direction", many: "directions" },
  bible: null,
  outline: null,
  chapters: { one: "chapitre", many: "chapitres" },
};

export function downstreamStageLabel(stage: DownstreamStage): string {
  return DOWNSTREAM_STAGE_LABELS[stage];
}

export function obsolescenceReasonLabel(reason: ObsolescenceReason): string {
  return OBSOLESCENCE_REASON_LABELS[reason];
}

/**
 * "4 chapitres sur 12", or `null` when there is nothing useful to count —
 * a stage that holds a single row, or one whose doubt is entirely inherited and
 * so concerns all of it rather than a part.
 */
export function obsolescenceScopeLabel(entry: StageObsolescence): string | null {
  const unit = DOWNSTREAM_STAGE_UNITS[entry.stage];

  if (unit === null || entry.precedingCount === 0) return null;

  const noun = entry.precedingCount === 1 ? unit.one : unit.many;

  return `${entry.precedingCount} ${noun} sur ${entry.presentCount}`;
}
