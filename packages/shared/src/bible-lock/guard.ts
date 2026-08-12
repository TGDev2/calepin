/**
 * What a write path composes so a locked element is never modified silently
 * (CAL-095).
 *
 * The specification's principle 4.1 is *l'intelligence artificielle ne doit pas
 * modifier silencieusement les éléments validés*, and §5.6 makes the fact-level
 * form of it explicit: *l'utilisateur peut verrouiller un fait afin d'empêcher
 * sa modification automatique*. Both are one rule at the statement — a write
 * that reaches a locked row refuses — and the rule belongs beside the row
 * rather than in each caller, which is what `editAnalysisSection` says of the
 * validated analysis in the same words: honouring it in the one statement that
 * could ignore it is cheaper than remembering to check it everywhere.
 *
 * Three functions and no query. Each one reads a row the write path was already
 * reading, so the guard costs a column in a `select` rather than a round trip.
 */

import { ConflictError, InternalError } from "../errors/app-error";
import type { BibleLockGate } from "./gate";
import { BIBLE_LOCK_LABELS, type BibleLockableModel, type CharacterLockField } from "./models";

/** The shape of a lockable row, as every one of the nine carries it. */
export interface LockableRow {
  readonly lockedAt: Date | null;
}

/** The shape of a character row, which carries the field lock beside the row one. */
export interface FieldLockableRow extends LockableRow {
  readonly lockedFields: readonly CharacterLockField[];
}

/** Whether the whole element is locked. */
export function isBibleElementLocked(row: LockableRow): boolean {
  return row.lockedAt !== null;
}

/**
 * Whether this sheet field may not be written.
 *
 * The derivation `Character.lockedFields`' own doc comment states: *a field is
 * locked when the row is locked or the field is listed here.* Two columns, one
 * answer, computed in one place — a stored third column saying the same thing
 * is what this repository refuses everywhere it derives state.
 */
export function isCharacterFieldLocked(row: FieldLockableRow, field: CharacterLockField): boolean {
  return isBibleElementLocked(row) || row.lockedFields.includes(field);
}

/** Whether any field of this sheet is locked, whole row or field by field. */
export function isCharacterPartlyLocked(row: FieldLockableRow): boolean {
  return isBibleElementLocked(row) || row.lockedFields.length > 0;
}

/** The three ways a write can meet a lock, each with its own remedy. */
export const BIBLE_LOCK_ACTIONS = ["modify", "delete", "generate"] as const;

export type BibleLockAction = (typeof BIBLE_LOCK_ACTIONS)[number];

/**
 * Developer-facing English, one fixed string per action.
 *
 * A table rather than a sentence built from the model, because this becomes the
 * first line of `error.stack` and §7 asks that a message never be interpolated
 * with anything. Which element it was is carried by `fieldPath`, which is a
 * loggable field precisely because a model name is an identifier (§9).
 */
const MESSAGES: Readonly<Record<BibleLockAction, string>> = {
  modify: "a locked bible element cannot be edited",
  delete: "a locked bible element cannot be deleted",
  generate: "a generation would rebuild a locked bible element",
};

/**
 * The remedy in the author's language, agreed with the element it is about.
 *
 * One clause per way a lock can be met, because the remedy differs: an edit and
 * a deletion are refused at the element itself, while a generation is refused
 * before it starts and the author has a second option — leave the lock and ask
 * for something else instead.
 */
function remedy(action: BibleLockAction, pronoun: "le" | "la"): string {
  switch (action) {
    case "modify":
      return `déverrouillez-${pronoun} pour ${pronoun} modifier.`;
    case "delete":
      return `déverrouillez-${pronoun} pour ${pronoun} supprimer.`;
    case "generate":
      return "levez le verrou pour relancer cette génération, ou laissez-le en place.";
  }
}

/**
 * What a write path returns when it reaches a locked element.
 *
 * `conflict`, never `forbidden`: the author is not being refused a right, they
 * are being told the element is settled and that lifting the lock is the step
 * before this one. Its own code rather than a bare `CONFLICT` for
 * `OBSOLESCENCE_NOT_ACKNOWLEDGED`'s stated reason — the interface answers it by
 * naming what stands in the way and offering to lift it, which is a different
 * screen from every other refusal.
 */
export function bibleElementLockedError(
  model: BibleLockableModel,
  action: BibleLockAction,
): ConflictError {
  const label = BIBLE_LOCK_LABELS[model];

  return new ConflictError({
    code: "BIBLE_ELEMENT_LOCKED",
    message: MESSAGES[action],
    userMessage: `${label.locked} : ${remedy(action, label.pronoun)}`,
    fieldPath: model,
  });
}

/**
 * What a generation refused by the gate answers with.
 *
 * The sentence names the *kind* of the first element in the way, because a
 * message has to name one thing and the complete list is `gate.blocking` — the
 * screen shows that, and the two cannot disagree because both are read off one
 * gate. A gate that is not blocked has no sentence to give, and asking it for
 * one is a call-site bug rather than a state: it throws.
 */
export function blockedGenerationError(gate: BibleLockGate): ConflictError {
  const first = gate.blocking[0];

  if (first === undefined) {
    throw new InternalError({
      message: "a generation was refused by a gate that blocks nothing",
      fieldPath: "blocking",
    });
  }

  return bibleElementLockedError(first.model, "generate");
}
