/**
 * What can be locked in a bible, and what a lock is written on (CAL-095).
 *
 * The columns were written three epics ago and every one of them names this
 * task: `BibleIdentity.lockedAt`'s comment says *CAL-095 makes it bite before a
 * generation runs*, `TimelineEvent`'s and `CanonFact`'s say *the lock, same
 * convention as every other bible element*, and `WorldRule.name` exists *so a
 * locked rule can be cited by name when it blocks a generation*. What did not
 * exist is any code that sets one, clears one or reads one.
 *
 * **The lock is a timestamp on the row it protects, and nothing else.** No lock
 * table, no `isLocked` boolean, no `lockedById`. A side table would be a second
 * answer able to disagree with nine columns that already exist and could not
 * carry a foreign key without naming all nine anyway; a boolean beside the
 * timestamp is the shape `prisma/schema.test.ts` has forbidden since CAL-016;
 * and who locked a row is what the audit block already records, which is
 * `CreativeDirection.discardedAt`'s reason for having no `discardedById`.
 *
 * This module names the models rather than inventing a parallel vocabulary of
 * kinds. A model name is what `scopedWhere` and `delegateName` already take, so
 * a registry of names is a registry the repository can loop over — and
 * `prisma/schema.test.ts` reads this list instead of restating it, so there is
 * one answer to *which elements are lockable* rather than two.
 */

import type { $Enums } from "@prisma/client";

import type { ProjectOwnedModelName } from "../repository/owned-models";

/**
 * The nine bible models an author can lock an element of.
 *
 * `Bible` itself is absent: its state is `validatedAt` (CAL-100), which is a
 * different decision about a different thing — validating a bible says the
 * whole of it is settled, where a lock says one element of it is. So are the
 * three join tables (`TimelineEventParticipant`, `CanonFactBelief`,
 * `CanonFactSubject`): they assert nothing of their own, and locking one would
 * be locking half of the row it hangs off.
 *
 * `ChapterOutline` carries the same column and is deliberately not here. The
 * plan of a chapter is not a bible element — it is CAL-107's, under the same
 * convention and a different epic — and the written chapter is locked by
 * `Chapter.status = LOCKED`, which the specification made one of the seven
 * states of a chapter's life.
 */
export const BIBLE_LOCKABLE_MODELS = [
  "BibleIdentity",
  "BibleStyle",
  "BibleWorld",
  "Character",
  "Relationship",
  "Place",
  "WorldRule",
  "TimelineEvent",
  "CanonFact",
] as const satisfies readonly ProjectOwnedModelName[];

export type BibleLockableModel = (typeof BIBLE_LOCKABLE_MODELS)[number];

const LOCKABLE = new Set<string>(BIBLE_LOCKABLE_MODELS);

/** Whether an element of this model can be locked on its own. */
export function isBibleLockableModel(model: string): model is BibleLockableModel {
  return LOCKABLE.has(model);
}

/**
 * The sheet fields a character can be locked field by field on, in the order
 * `Character` declares its columns.
 *
 * Mirrors the `CharacterField` Prisma enum, which exists so that a field name
 * no column answers to is unstorable. Stated here as a tuple rather than read
 * off `$Enums` because a type is not a value: the repository needs to check a
 * caller's field at runtime, and `prisma/schema.test.ts` needs a list to pin
 * against the enum — `CANON_FACT_VALIDITIES`' arrangement one package over.
 */
export const CHARACTER_LOCK_FIELDS = [
  "NAME",
  "AGE",
  "ROLE",
  "IMPORTANCE",
  "APPEARANCE",
  "INITIAL_SITUATION",
  "APPARENT_DESIRE",
  "DEEP_NEED",
  "FEAR",
  "CONTRADICTION",
  "SECRET",
  "PAST",
  "PLANNED_ARC",
  "SPEECH_STYLE",
  "HELD_KNOWLEDGE",
  "ELEMENTS_TO_PRESERVE",
] as const satisfies readonly $Enums.CharacterField[];

export type CharacterLockField = (typeof CHARACTER_LOCK_FIELDS)[number];

const LOCK_FIELDS = new Set<string>(CHARACTER_LOCK_FIELDS);

/** Whether this names a sheet field a lock can be taken on. */
export function isCharacterLockField(field: string): field is CharacterLockField {
  return LOCK_FIELDS.has(field);
}

/**
 * The French noun phrase for each of the sixteen sheet fields (CAL-097) — one
 * table for the lock button, the editor's own field labels and the edit
 * history's "changed fields" line, `BIBLE_LOCK_LABELS`'s reason for living
 * here rather than in `apps/web`: this module already holds the French copy
 * this exact concern needs.
 */
export const CHARACTER_LOCK_FIELD_LABELS: Readonly<Record<CharacterLockField, string>> = {
  NAME: "Nom",
  AGE: "Âge",
  ROLE: "Rôle",
  IMPORTANCE: "Importance",
  APPEARANCE: "Apparence",
  INITIAL_SITUATION: "Situation initiale",
  APPARENT_DESIRE: "Désir apparent",
  DEEP_NEED: "Besoin profond",
  FEAR: "Peur",
  CONTRADICTION: "Contradiction",
  SECRET: "Secret",
  PAST: "Passé",
  PLANNED_ARC: "Évolution prévue",
  SPEECH_STYLE: "Manière de parler",
  HELD_KNOWLEDGE: "Connaissances détenues",
  ELEMENTS_TO_PRESERVE: "Éléments à ne pas modifier",
};

/**
 * The one model a lock can name a field of.
 *
 * A constant rather than a condition written out at each of the four sites that
 * needs it: the specification asks for a field-level lock on the character
 * sheet and nowhere else, and a second model gaining one is a decision, not a
 * line somebody adds to an `if`.
 */
export const FIELD_LOCKABLE_MODEL = "Character" satisfies BibleLockableModel;

/** How one refusal sentence is built for one kind of element. */
export interface BibleLockLabel {
  /** The clause naming the state, agreed with the element's own gender. */
  readonly locked: string;
  /** The object pronoun the remedy clause takes, so the agreement holds twice. */
  readonly pronoun: "le" | "la";
}

/**
 * What to call each element in French, as the subject of a refusal sentence.
 *
 * A noun phrase and never the element's own name: a name, a statement or a
 * label is the author's text, and a `userMessage` is composed from this table
 * alone so that no wording of theirs can reach one (§9). Citing the locked
 * element itself is the screen's job, from rows it has already read.
 *
 * The pronoun rides beside the clause because French agrees twice in the
 * sentence these compose into — *déverrouillez-**la** pour **la** modifier* —
 * and a table carrying only the subject would force the remedy to be written
 * out nine times to stay grammatical.
 */
export const BIBLE_LOCK_LABELS: Readonly<Record<BibleLockableModel, BibleLockLabel>> = {
  BibleIdentity: { locked: "L'identité du roman est verrouillée", pronoun: "la" },
  BibleStyle: { locked: "La section style est verrouillée", pronoun: "la" },
  BibleWorld: { locked: "La section monde est verrouillée", pronoun: "la" },
  Character: { locked: "Ce personnage est verrouillé", pronoun: "le" },
  Relationship: { locked: "Ce lien est verrouillé", pronoun: "le" },
  Place: { locked: "Ce lieu est verrouillé", pronoun: "le" },
  WorldRule: { locked: "Cette règle du monde est verrouillée", pronoun: "la" },
  TimelineEvent: { locked: "Cet événement de la chronologie est verrouillé", pronoun: "le" },
  CanonFact: { locked: "Ce fait canonique est verrouillé", pronoun: "le" },
};
