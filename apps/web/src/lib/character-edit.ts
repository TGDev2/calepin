/**
 * The character editor's form state, its French sentences and its submission
 * shape (CAL-097) — `lib/relationship-edit.ts`'s division: a `"use server"`
 * module may export only async functions, so the types and copy both sides
 * need live here.
 */

import type { CharacterLockField } from "@calepin/shared/bible-lock";

/** What the autosave (and the manual "Enregistrer" fallback) reports. */
export type CharacterSaveState =
  | { readonly status: "saved"; readonly updated: boolean }
  | { readonly status: "error"; readonly message: string };

/** What a lock or unlock action reports — the button reads its own pending state locally. */
export type CharacterLockActionState =
  { readonly status: "ok" } | { readonly status: "error"; readonly message: string };

/** The sixteen own-row fields, exactly as read off the DOM before parsing. */
export interface CharacterFormSubmission {
  readonly name: string;
  readonly age: number | null;
  readonly role: string;
  readonly importance: string;
  readonly appearance: string;
  readonly initialSituation: string;
  readonly apparentDesire: string;
  readonly deepNeed: string;
  readonly fear: string;
  readonly contradiction: string;
  readonly secret: string;
  readonly past: string;
  readonly plannedArc: string;
  readonly speechStyle: string;
  readonly heldKnowledge: readonly string[];
  readonly elementsToPreserve: readonly string[];
}

export const CHARACTER_MISSING_MESSAGE =
  "Ce personnage n'existe plus. Rechargez la page pour voir l'état actuel de la bible.";

export const CHARACTER_SAVE_UNAVAILABLE_MESSAGE =
  "La fiche n'a pas pu être enregistrée. Réessayez dans un instant.";

export const CHARACTER_LOCK_UNAVAILABLE_MESSAGE =
  "Le verrou n'a pas pu être posé. Réessayez dans un instant.";

export const CHARACTER_UNLOCK_UNAVAILABLE_MESSAGE =
  "Le verrou n'a pas pu être levé. Réessayez dans un instant.";

/** The bible screen a deleted or foreign character redirects back to. */
export function bibleCharactersPath(projectId: string): string {
  return `/projects/${projectId}/bible`;
}

export function characterEditorPath(projectId: string, characterId: string): string {
  return `/projects/${projectId}/bible/characters/${characterId}`;
}

/** Every field a sheet can be locked on, grouped the way the editor renders them. */
export const CHARACTER_FIELD_GROUPS: readonly {
  readonly title: string;
  readonly fields: readonly CharacterLockField[];
}[] = [
  { title: "Identité", fields: ["NAME", "AGE", "ROLE", "IMPORTANCE"] },
  {
    title: "Psychologie",
    fields: ["APPARENT_DESIRE", "DEEP_NEED", "FEAR", "CONTRADICTION", "SECRET"],
  },
  { title: "Récit", fields: ["APPEARANCE", "INITIAL_SITUATION", "PAST", "PLANNED_ARC"] },
  { title: "Voix", fields: ["SPEECH_STYLE"] },
  { title: "Listes", fields: ["HELD_KNOWLEDGE", "ELEMENTS_TO_PRESERVE"] },
];
