/**
 * The project creation wizard's draft shape, its option lists and its
 * validation (CAL-040) — the single source of truth both the client wizard
 * and the server action check against, so the two cannot drift apart the
 * way a duplicated rule eventually does.
 *
 * Pure and isomorphic on purpose: no `"use client"`, no `"use server"`, no
 * `localStorage`, no database. It only knows the shape of a `FormData` and
 * the shape `@calepin/shared/repository`'s `createProjectWithSourceText`
 * expects — content, not narrative rules, which is why it lives in the
 * interface layer rather than a domain (CLAUDE.md §3.3).
 *
 * The target-length/freedom-level enum *values* are derived from
 * `CreateProjectInput`'s own fields rather than imported from
 * `@prisma/client` directly — the same trick `Adapter`/`NodemailerConfig`
 * already use elsewhere in this codebase, and for the same reason: the
 * interface layer may never hold a Prisma import (CLAUDE.md §3.5).
 */

import type { CreateProjectInput } from "@calepin/shared/repository";
import { countWords } from "@calepin/shared/text";

import { PROJECT_TITLE_MAX_LENGTH, readProjectTitle } from "./project-title";

export type TargetLength = NonNullable<CreateProjectInput["targetLength"]>;
export type FreedomLevel = NonNullable<CreateProjectInput["freedomLevel"]>;

/** The six steps of the wizard, in the order the backlog names them. */
export const PROJECT_CREATION_STEPS = [
  "title",
  "sourceText",
  "language",
  "targetLength",
  "targetAudience",
  "freedomLevel",
] as const;

export type ProjectCreationStep = (typeof PROJECT_CREATION_STEPS)[number];

/**
 * The wizard's own escape hatch for a language or an audience not on the
 * short list — CAL-042/CAL-045 own detection and propagation; this is only
 * "let me type it myself" for the case a preset doesn't cover.
 */
export const OTHER_OPTION_VALUE = "autre";

/**
 * The draft as the form holds it: every field a string, including the two
 * that only apply conditionally (`targetWordCount` for a `CUSTOM` length,
 * `languageOther`/`targetAudienceOther` for the "Autre" choice). Numbers are
 * parsed at validation time, the same choice every other form in this app
 * makes reading raw `FormData`.
 */
export interface ProjectCreationDraft {
  readonly title: string;
  readonly sourceText: string;
  readonly language: string;
  readonly languageOther: string;
  readonly targetLength: string;
  readonly targetWordCount: string;
  readonly targetAudience: string;
  readonly targetAudienceOther: string;
  readonly freedomLevel: string;
}

export const DEFAULT_LANGUAGE = "fr";
export const DEFAULT_TARGET_AUDIENCE = "Grand public";

export const EMPTY_PROJECT_CREATION_DRAFT: ProjectCreationDraft = {
  title: "",
  sourceText: "",
  language: DEFAULT_LANGUAGE,
  languageOther: "",
  targetLength: "STANDARD",
  targetWordCount: "",
  targetAudience: DEFAULT_TARGET_AUDIENCE,
  targetAudienceOther: "",
  freedomLevel: "BALANCED",
};

export const SOURCE_TEXT_MAX_WORDS = 2000;

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export const LANGUAGE_OPTIONS: readonly SelectOption[] = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
  { value: "es", label: "Espagnol" },
  { value: "de", label: "Allemand" },
  { value: "it", label: "Italien" },
  { value: OTHER_OPTION_VALUE, label: "Autre" },
];

export interface TargetLengthOption extends SelectOption {
  readonly value: TargetLength;
  readonly caption: string;
}

export const TARGET_LENGTH_OPTIONS: readonly TargetLengthOption[] = [
  { value: "SHORT", label: "Roman court", caption: "Environ 30 000 à 45 000 mots." },
  { value: "STANDARD", label: "Roman standard", caption: "Environ 50 000 à 80 000 mots." },
  { value: "LONG", label: "Roman long", caption: "Environ 80 000 à 110 000 mots." },
  { value: "CUSTOM", label: "Longueur personnalisée", caption: "Choisissez vous-même le nombre de mots visé." },
];

export const TARGET_AUDIENCE_OPTIONS: readonly SelectOption[] = [
  { value: "Grand public", label: "Grand public" },
  { value: "Jeunes adultes", label: "Jeunes adultes" },
  { value: "Adultes", label: "Adultes" },
  { value: "Enfants", label: "Enfants" },
  { value: OTHER_OPTION_VALUE, label: "Autre" },
];

export interface FreedomLevelOption extends SelectOption {
  readonly value: FreedomLevel;
  readonly caption: string;
}

export const FREEDOM_LEVEL_OPTIONS: readonly FreedomLevelOption[] = [
  {
    value: "LOW",
    label: "Faible",
    caption: "Développement très fidèle au texte source.",
  },
  {
    value: "BALANCED",
    label: "Équilibré",
    caption: "Le noyau de l'histoire est conservé, avec des ajouts significatifs.",
  },
  {
    value: "HIGH",
    label: "Élevé",
    caption: "Réinterprétation libre, tant que les thèmes essentiels sont conservés.",
  },
];

/** What a validated draft becomes — `createProjectWithSourceText`'s input, minus the owner. */
export interface ValidatedProjectCreation {
  readonly title: string;
  readonly sourceText: { readonly content: string; readonly wordCount: number };
  readonly language: string;
  readonly targetLength: TargetLength;
  readonly targetWordCount: number | null;
  readonly targetAudience: string;
  readonly freedomLevel: FreedomLevel;
}

function isTargetLength(value: string): value is TargetLength {
  return value === "SHORT" || value === "STANDARD" || value === "LONG" || value === "CUSTOM";
}

function isFreedomLevel(value: string): value is FreedomLevel {
  return value === "LOW" || value === "BALANCED" || value === "HIGH";
}

/** The language or audience actually meant: the preset, or what was typed for "Autre". */
function resolveWithOther(value: string, other: string): string {
  return value === OTHER_OPTION_VALUE ? other.trim() : value.trim();
}

/**
 * Each step's own rule, returning the French message to show or `null` when
 * the step is complete. Used both to gate "Suivant" in the wizard and to
 * build the aggregate check the server action runs as its defense in depth.
 */
export const FIELD_VALIDATORS: Record<ProjectCreationStep, (draft: ProjectCreationDraft) => string | null> = {
  title: (draft) =>
    readProjectTitle(draft.title) === null
      ? `Le titre est obligatoire et ne peut pas dépasser ${PROJECT_TITLE_MAX_LENGTH} caractères.`
      : null,

  sourceText: (draft) => {
    const content = draft.sourceText.trim();
    if (content === "") return "Le texte source ne peut pas être vide.";

    const wordCount = countWords(content);
    if (wordCount > SOURCE_TEXT_MAX_WORDS) {
      return `Le texte source dépasse la limite de ${SOURCE_TEXT_MAX_WORDS} mots (actuellement ${wordCount}).`;
    }

    return null;
  },

  language: (draft) =>
    resolveWithOther(draft.language, draft.languageOther) === ""
      ? "Merci d'indiquer la langue du texte source."
      : null,

  targetLength: (draft) => {
    if (!isTargetLength(draft.targetLength)) return "Merci de choisir une longueur cible.";
    if (draft.targetLength !== "CUSTOM") return null;

    const wordCount = Number.parseInt(draft.targetWordCount, 10);
    return Number.isInteger(wordCount) && wordCount > 0
      ? null
      : "Merci d'indiquer un nombre de mots valide pour une longueur personnalisée.";
  },

  targetAudience: (draft) =>
    resolveWithOther(draft.targetAudience, draft.targetAudienceOther) === ""
      ? "Merci d'indiquer le public visé."
      : null,

  freedomLevel: (draft) =>
    isFreedomLevel(draft.freedomLevel) ? null : "Merci de choisir un degré de liberté.",
};

export type ProjectCreationErrors = Partial<Record<ProjectCreationStep, string>>;

export type ProjectCreationValidation =
  | { readonly ok: true; readonly value: ValidatedProjectCreation }
  | { readonly ok: false; readonly errors: ProjectCreationErrors };

/**
 * The full draft, checked step by step. The wizard only ever lets a visitor
 * reach the last step with every prior one already valid, so this failing
 * in normal use means the client-side gate and this function have drifted —
 * worth treating as a real (if rare) case rather than an assertion, since a
 * draft restored from an old `localStorage` entry after a shape change is a
 * realistic way to reach it.
 */
export function validateProjectCreationDraft(draft: ProjectCreationDraft): ProjectCreationValidation {
  const errors: ProjectCreationErrors = {};

  for (const step of PROJECT_CREATION_STEPS) {
    const message = FIELD_VALIDATORS[step](draft);
    if (message !== null) errors[step] = message;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const title = readProjectTitle(draft.title);
  const sourceText = draft.sourceText.trim();
  // Every branch above already refused a draft where any of these could be
  // null/NaN/unresolved — asserted again here only because TypeScript
  // cannot see across the loop, not because the check is skipped.
  if (title === null || !isTargetLength(draft.targetLength) || !isFreedomLevel(draft.freedomLevel)) {
    return { ok: false, errors: { title: "Le formulaire contient une erreur inattendue." } };
  }

  return {
    ok: true,
    value: {
      title,
      sourceText: { content: sourceText, wordCount: countWords(sourceText) },
      language: resolveWithOther(draft.language, draft.languageOther),
      targetLength: draft.targetLength,
      targetWordCount:
        draft.targetLength === "CUSTOM" ? Number.parseInt(draft.targetWordCount, 10) : null,
      targetAudience: resolveWithOther(draft.targetAudience, draft.targetAudienceOther),
      freedomLevel: draft.freedomLevel,
    },
  };
}

const DRAFT_FIELDS = [
  "title",
  "sourceText",
  "language",
  "languageOther",
  "targetLength",
  "targetWordCount",
  "targetAudience",
  "targetAudienceOther",
  "freedomLevel",
] as const satisfies readonly (keyof ProjectCreationDraft)[];

/** Reads a draft back out of the final step's `FormData` — every field a hidden input carried. */
export function draftFromFormData(formData: FormData): ProjectCreationDraft {
  const draft = { ...EMPTY_PROJECT_CREATION_DRAFT };

  return DRAFT_FIELDS.reduce<ProjectCreationDraft>((acc, field) => {
    const value = formData.get(field);
    return typeof value === "string" ? { ...acc, [field]: value } : acc;
  }, draft);
}

/** The French sentence for a transient failure — the same wording every other project action uses. */
export const PROJECT_CREATION_UNAVAILABLE_MESSAGE =
  "La création n'a pas pu aboutir. Réessayez dans un instant ; votre brouillon est conservé.";

/**
 * What `createProjectFromDraftAction` (`app/projects/new/actions.ts`) answers
 * with, and what the wizard's `useActionState` holds. Defined here rather
 * than in the action module so the client component can `import type` it
 * without ever importing a `"use server"` module as a value — the lesson
 * CAL-039's `GenerationIndicator` left behind: doing so pulls in everything
 * that module imports too, `@/lib/auth` included, which validates the
 * environment at import time and breaks a component render with no `.env`.
 */
export type ProjectCreationActionState =
  | { readonly ok: true; readonly projectId: string }
  | { readonly ok: false; readonly errors?: ProjectCreationErrors; readonly formError?: string };

export const INITIAL_PROJECT_CREATION_ACTION_STATE: ProjectCreationActionState = { ok: false };
