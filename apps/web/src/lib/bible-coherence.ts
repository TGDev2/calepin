/**
 * The words the coherence screen uses, and the closed codes its banner carries
 * (CAL-099).
 *
 * The division CLAUDE.md §4.3 draws, applied here: `@calepin/bible` owns what a
 * finding *says* — the explanation and the proposed correction are written into
 * `QualityIssue`'s own columns by whatever writes the row — and `apps/web` owns
 * the words around it: the name of a check, the rank on a badge, the word on a
 * button.
 *
 * The tables are keyed off the domain's own vocabularies, so a check added to
 * `BIBLE_COHERENCE_CHECKS` stops this file compiling until it has a name.
 */

import type {
  CoherenceCheckId,
  CoherenceDecision,
  QualityIssueSeverity,
  QualityIssueStatus,
} from "@calepin/shared/coherence";

export function bibleCoherencePath(projectId: string): string {
  return `/projects/${projectId}/bible/coherence`;
}

/** What each check looks for, in one phrase the author can recognise. */
export const BIBLE_CHECK_LABELS: Readonly<Record<CoherenceCheckId, string>> = {
  "bible-timeline-arithmetic": "Âges et dates",
  "bible-relationship-symmetry": "Liens à sens unique",
  "bible-undeclared-name": "Noms sans fiche",
  "bible-canon-fact-collision": "Faits opposés",
  "bible-opposed-canon-facts": "Faits opposés par le sens",
  "bible-contradictory-world-rules": "Règles du monde incompatibles",
};

/**
 * A rank, never a score — and the word says so. *Bloquant* is the one that
 * matters on this screen: it is the same thing as *the validation is refused*,
 * so the label names the consequence rather than the level.
 */
export const COHERENCE_SEVERITY_LABELS: Readonly<Record<QualityIssueSeverity, string>> = {
  CRITICAL: "Bloquant",
  MAJOR: "À regarder",
  MINOR: "Pour information",
};

export const COHERENCE_STATUS_LABELS: Readonly<Record<QualityIssueStatus, string>> = {
  DETECTED: "À arbitrer",
  ACCEPTED: "Assumé",
  TO_FIX: "À corriger",
  FIXED: "Résolu",
  IGNORED: "Écarté",
};

/**
 * The three decisions an author may write, and what each one means for the
 * validation. *À corriger* deliberately keeps the validation closed: it is a
 * decision to change the bible, not to stand by it.
 */
export const COHERENCE_DECISION_LABELS: Readonly<
  Record<CoherenceDecision, { readonly action: string; readonly effect: string }>
> = {
  ACCEPTED: {
    action: "Assumer",
    effect: "Le signalement est un choix délibéré. La bible pourra être validée.",
  },
  TO_FIX: {
    action: "À corriger",
    effect: "Vous comptez modifier la bible. La validation reste fermée.",
  },
  IGNORED: {
    action: "Écarter",
    effect: "Le signalement ne porte sur rien de réel. La bible pourra être validée.",
  },
};

/** The codes the banner carries — never a message (`project-action-error.ts`'s rule). */
export const BIBLE_COHERENCE_ERRORS = [
  "check",
  "arbitration",
  "validation",
  "not-coherent",
  "already-validated",
  "out-of-order",
  "missing",
] as const;
export type BibleCoherenceError = (typeof BIBLE_COHERENCE_ERRORS)[number];

const MESSAGES: Readonly<Record<BibleCoherenceError, string>> = {
  check: "Le contrôle n'a pas pu être lancé. Réessayez dans un instant.",
  arbitration: "Votre décision n'a pas pu être enregistrée. Réessayez dans un instant.",
  validation: "La bible n'a pas pu être validée. Réessayez dans un instant.",
  "not-coherent":
    "La bible ne peut pas être validée tant que les contradictions bloquantes n'ont pas été arbitrées.",
  "already-validated": "Cette bible est déjà validée.",
  "out-of-order":
    "La bible ne peut pas être validée à ce stade : l'analyse doit être validée et une direction retenue avant elle.",
  missing: "Ce projet n'a pas encore de bible.",
};

export function isBibleCoherenceError(value: string): value is BibleCoherenceError {
  return (BIBLE_COHERENCE_ERRORS as readonly string[]).includes(value);
}

export function bibleCoherenceErrorMessage(
  value: string | string[] | undefined,
): string | null {
  const code = Array.isArray(value) ? value[0] : value;
  if (code === undefined || !isBibleCoherenceError(code)) return null;

  return MESSAGES[code];
}

export function bibleCoherencePathWithError(
  projectId: string,
  error: BibleCoherenceError,
): string {
  return `${bibleCoherencePath(projectId)}?error=${error}`;
}

export function readText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}
