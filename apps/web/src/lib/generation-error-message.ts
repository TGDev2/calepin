/**
 * What a failed generation says to its author (CAL-063).
 *
 * A `Generation` row records a failure as three closed enumerations — a code, a
 * category and a class (§9 allows a failure no more than that) — and this is the
 * only place they become a sentence. The same division `project-action-error.ts`
 * and `sign-in-error-message.ts` already draw: the layer underneath stores a
 * classification, the interface layer owns the French.
 *
 * **Three sources, in order, and the order is the design.**
 *
 * 1. A per-code sentence, for the codes where the category's own message is too
 *    vague to act on. These are not copies of the `userMessage` those errors
 *    carry when they are thrown — they are read *beside a "Relancer" button*, so
 *    they do not end by telling the reader they may relaunch, and they say what
 *    only this screen can say ("after five attempts").
 * 2. Otherwise the category's message, straight from `@calepin/shared/errors`.
 *    It is already written for exactly this reader and already says that the
 *    project is intact, which for a failed generation is both true and the first
 *    thing an author needs to hear.
 * 3. Otherwise the class. A row written by a later release can carry a code this
 *    build has no name for; `listFailedGenerations` answers `null` for it rather
 *    than a code it cannot explain, and the class is still meaningful because the
 *    enum is pinned to the schema.
 *
 * Every branch reassures. A failed generation genuinely cannot corrupt a project
 * — the write path is append-only (ADR-001), so the last valid revision is still
 * there — and the moment to say so is the moment it fails.
 */

import { type ErrorCategory, type ErrorCode, USER_MESSAGES } from "@calepin/shared/errors";
import type { GenerationFailureClass } from "@calepin/shared/generation";

/**
 * The codes worth their own sentence. Deliberately short: a code earns an entry
 * when the reader would do something *different* because of it, which is the same
 * bar `PROJECT_ACTION_ERRORS` sets for its own coarse list.
 */
const MESSAGE_BY_CODE: Partial<Record<ErrorCode, string>> = {
  GENERATION_ATTEMPTS_EXHAUSTED:
    "Plusieurs tentatives automatiques ont échoué et Calepin s'est arrêté pour ne pas " +
    "continuer à consommer votre budget. Votre projet est intact.",
  GENERATION_INTERRUPTED:
    "La génération a été interrompue par un incident technique de notre côté. " +
    "Rien n'a été écrit dans votre projet, et cette tentative ne vous est pas comptée.",
  MODEL_OUTPUT_INVALID:
    "Le modèle a répondu quelque chose d'inexploitable pour cette opération. " +
    "Votre projet est intact.",
  MODEL_OUTPUT_OFF_TOPIC: "Le modèle n'a pas répondu à la demande. Votre projet est intact.",
  CONTEXT_BUDGET_EXCEEDED:
    "Le contexte nécessaire dépasse la capacité prévue pour cette opération. " +
    "Réduisez les consignes ou les extraits fournis avant de relancer.",
  CONTEXT_ITEM_OVERSIZED:
    "Un des éléments fournis est trop long pour être transmis tel quel. " +
    "Raccourcissez-le avant de relancer.",
  RATE_LIMITED:
    "Le service de génération a reçu trop de demandes coup sur coup. " +
    "Patientez un instant avant de relancer.",
};

/**
 * What each class says when nothing more precise is available. Not a remedy — a
 * class is not specific enough to suggest one — but an honest statement of where
 * the generation stands, which is what the button beside it acts on.
 */
const MESSAGE_BY_CLASS: Record<GenerationFailureClass, string> = {
  transient:
    "La génération a échoué sur un incident passager. Votre projet est intact : " +
    "une nouvelle tentative a de bonnes chances d'aboutir.",
  rate_limited:
    "Le service de génération a reçu trop de demandes coup sur coup. " +
    "Patientez un instant avant de relancer.",
  permanent:
    "La génération n'a pas abouti et une nouvelle tentative identique échouerait " +
    "de la même façon. Votre projet est intact.",
};

/** The answer when the row carries no classification at all — a legacy row. */
const UNCLASSIFIED_MESSAGE =
  "La génération n'a pas abouti. Votre projet est intact : vous pouvez la relancer.";

export interface GenerationFailure {
  readonly errorCode: ErrorCode | null;
  readonly errorCategory: ErrorCategory | null;
  readonly failureClass: GenerationFailureClass | null;
}

export function generationFailureMessage(failure: GenerationFailure): string {
  const byCode = failure.errorCode === null ? undefined : MESSAGE_BY_CODE[failure.errorCode];

  if (byCode !== undefined) return byCode;
  if (failure.errorCategory !== null) return USER_MESSAGES[failure.errorCategory];
  if (failure.failureClass !== null) return MESSAGE_BY_CLASS[failure.failureClass];

  return UNCLASSIFIED_MESSAGE;
}

/**
 * How many tries it took, in French, or `null` when there is nothing to say.
 *
 * Worth showing beside the message rather than folded into it: an author deciding
 * whether to click *Relancer* wants to know whether Calepin already tried five
 * times or died on the first attempt, and those two are the same sentence with a
 * very different meaning.
 */
export function generationAttemptCountLabel(attemptCount: number): string | null {
  if (attemptCount < 1) return null;

  return attemptCount === 1 ? "1 tentative" : `${attemptCount} tentatives`;
}
