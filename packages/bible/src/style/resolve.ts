/**
 * The nine `BibleStyle` column values, from an answer's constraint pairs
 * (CAL-089).
 *
 * `BibleStyle` (CAL-016) stores each element as one free text, deliberately —
 * its own doc comment says the operational-constraint requirement is about the
 * wording, so the column type stays the same free text as the rest. This
 * function is where a pair becomes that one text: the rule, then the breach,
 * joined by one fixed French connector — so persistence, when its task comes,
 * is a copy and not a translation. `resolveNovelIdentity`'s role one section
 * over.
 *
 * The connector is domain-owned French copy, `NARRATIVE_ENGINE_COPY`'s reason:
 * the author reads the same clause the writing context will quote. It flattens
 * without erasing — the breach stays visible in the stored text, which is what
 * the author reviews and what CAL-107's context hands the writing prompt.
 */

import type { OperationalStyle, StyleConstraint } from "./schema";

/**
 * What separates the rule from its breach in the stored text. A clause, not a
 * bare colon, so the resolved sentence still says what the second half *is*.
 */
export const STYLE_VIOLATION_CONNECTOR = "Signe de dérive :";

/**
 * The style section as `BibleStyle` stores it: seven texts and two lists,
 * under the columns' own names.
 */
export interface ResolvedBibleStyle {
  readonly pointOfView: string;
  readonly focalization: string;
  readonly tense: string;
  readonly languageRegister: string;
  readonly descriptiveDensity: string;
  readonly pacing: string;
  readonly dialogueBalance: string;
  readonly recurringMotifs: readonly string[];
  readonly elementsToAvoid: readonly string[];
}

/** One pair, flattened into the column's one text. */
function resolved(constraint: StyleConstraint): string {
  return `${constraint.rule} ${STYLE_VIOLATION_CONNECTOR} ${constraint.violation}`;
}

/** The nine column values, entry for entry and in the answer's own order. */
export function resolveBibleStyle(style: OperationalStyle): ResolvedBibleStyle {
  return {
    pointOfView: resolved(style.pointOfView),
    focalization: resolved(style.focalization),
    tense: resolved(style.tense),
    languageRegister: resolved(style.languageRegister),
    descriptiveDensity: resolved(style.descriptiveDensity),
    pacing: resolved(style.pacing),
    dialogueBalance: resolved(style.dialogueBalance),
    recurringMotifs: style.recurringMotifs.map(resolved),
    elementsToAvoid: style.elementsToAvoid.map(resolved),
  };
}
