/**
 * The canon fact editor's form state, its French sentences, its `FormData`
 * readers and its filters (CAL-098).
 *
 * Here rather than beside the actions because a `"use server"` module may
 * export only async functions — the division `lib/relationship-edit.ts` and
 * `lib/character-edit.ts` already draw.
 *
 * **The vocabulary is the point of this file.** A fact carries three
 * independent dimensions, and the screen must never say so: no *valeur de
 * vérité*, no *portée temporelle*, no enum member. What the author reads is
 * *ce qui est vrai dans le roman*, *quand*, and *qui le sait* — and what they
 * pick in the third block is a stance in plain words, with its consequence
 * shown beside it rather than asked for. The stance labels themselves are the
 * domain's (`CANON_FACT_BELIEF_STATE_LABELS`), so the author reads the same
 * words a prompt is given.
 */

import {
  beliefMatchesWorld,
  CANON_FACT_BELIEF_STATES,
  type CanonFactBeliefState,
  type CanonFactValidity,
} from "@calepin/bible";
import type { BibleCanonFactRow } from "@calepin/shared/repository";

/** What a canon fact form knows after a submission. */
export type CanonFactFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string };

export const INITIAL_CANON_FACT_FORM_STATE: CanonFactFormState = { status: "idle" };

/** The fact the form named is gone, or was never this project's (§3.5). */
export const CANON_FACT_MISSING_MESSAGE =
  "Ce fait n'existe plus. Rechargez la page pour voir l'état actuel de la bible.";

export const CANON_FACT_BIBLE_MISSING_MESSAGE =
  "Ce projet n'a pas encore de bible : les faits s'écrivent une fois la bible ouverte.";

export const CANON_FACT_WRITE_UNAVAILABLE_MESSAGE =
  "Le fait n'a pas pu être enregistré. Réessayez dans un instant.";

export const CANON_FACT_EDIT_UNAVAILABLE_MESSAGE =
  "Le fait n'a pas pu être modifié. Réessayez dans un instant.";

export const CANON_FACT_STATUS_UNAVAILABLE_MESSAGE =
  "L'état de ce fait n'a pas pu être changé. Réessayez dans un instant.";

export const CANON_FACT_DELETE_UNAVAILABLE_MESSAGE =
  "Le fait n'a pas pu être supprimé. Réessayez dans un instant.";

export const CANON_FACT_LOCK_UNAVAILABLE_MESSAGE =
  "Le verrou n'a pas pu être posé. Réessayez dans un instant.";

export const CANON_FACT_UNLOCK_UNAVAILABLE_MESSAGE =
  "Le verrou n'a pas pu être levé. Réessayez dans un instant.";

/**
 * The same statement, already in this bible.
 *
 * Refused before anything is written, over `canonFactKey` — the domain's own
 * comparison, which folds typography and word order out of the way so a fact
 * retyped slightly differently is still recognised. A doubled fact is not a
 * richer canon: it is two rows a coherence check will one day have to arbitrate
 * between, for a distinction nobody drew.
 */
export const CANON_FACT_DUPLICATE_MESSAGE =
  "Ce fait est déjà écrit dans cette bible, dans les mêmes termes.";

/** The editor a successful write returns to. */
export function canonFactsPath(projectId: string): string {
  return `/projects/${projectId}/bible/facts`;
}

/**
 * One trimmed field, or null when it is absent or blank — the three cases a
 * form conflates and a repository must not.
 */
export function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

/**
 * A day on the chronology's axis, or what the author typed when it is not one.
 *
 * The unparseable case travels through as-is rather than being flattened to
 * null: a number the schema can refuse is a mistake shown, and a silent null
 * would be a bound quietly forgotten.
 */
function readDay(value: unknown): unknown {
  const text = readText(value);

  if (text === null) return null;

  const day = Number(text);

  return Number.isInteger(day) ? day : text;
}

function readBound(formData: FormData, prefix: "validFrom" | "validUntil"): unknown {
  const day = readDay(formData.get(`${prefix}Day`));
  const precision = readText(formData.get(`${prefix}Precision`));
  const label = readText(formData.get(`${prefix}Label`));

  // A bound nobody filled in is an absent bound, not an empty one — which is
  // what lets a period be open at one end.
  if (day === null && precision === null && label === null) return null;

  return { day, precision, label };
}

/** The prefix a stance field carries, one per character of the cast. */
export const BELIEF_FIELD_PREFIX = "belief:";

/**
 * The three dimensions, assembled from what the form sent.
 *
 * Unvalidated on purpose: what a fact may say is `parseCanonFactContent`'s, in
 * `@calepin/bible`, and this only reads the boxes.
 *
 * **The blocks a chosen shape does not use are not read.** The three temporal
 * shapes are one radio group, so a period's bounds and an ending event are
 * mutually exclusive *on screen*; carrying a value out of the block the author
 * closed would refuse a submission nobody got wrong. Reading the block they
 * chose is not a silent correction — it is reading the form.
 */
export function readCanonFactSubmission(formData: FormData): unknown {
  const validity = readText(formData.get("validity"));
  const isPeriod = validity === "DURING_PERIOD";
  const isEnded = validity === "UNTIL_EVENT";

  const beliefs: { characterId: string; state: string }[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(BELIEF_FIELD_PREFIX)) continue;

    const state = readText(value);
    // The empty option is *non précisé*, and it writes no row: an absent
    // stance is weaker than an explicit UNAWARE, and the two must not be
    // conflated (`CanonFactBelief`'s own doc comment).
    if (state === null) continue;

    beliefs.push({ characterId: key.slice(BELIEF_FIELD_PREFIX.length), state });
  }

  const subjects = [
    ...formData.getAll("subjectCharacter").map((id) => ({ kind: "character", id: readText(id) })),
    ...formData.getAll("subjectPlace").map((id) => ({ kind: "place", id: readText(id) })),
  ].filter((subject) => subject.id !== null);

  return {
    statement: formData.get("statement"),
    isTrue: readText(formData.get("isTrue")) !== "false",
    validity,
    validFrom: isPeriod ? readBound(formData, "validFrom") : null,
    validUntil: isPeriod ? readBound(formData, "validUntil") : null,
    invalidatedByEventId: isEnded ? readText(formData.get("invalidatedByEventId")) : null,
    beliefs,
    subjects,
  };
}

/**
 * What a stance amounts to, once the world's own answer is known.
 *
 * Derived rather than stored, and derived here rather than in the domain: it is
 * a sentence, and `beliefMatchesWorld` is the rule. `UNAWARE` is its own case
 * because not knowing is not being wrong.
 */
export function describeStance(isTrue: boolean, state: CanonFactBeliefState): string {
  if (state === "UNAWARE") return "l'ignore";

  return beliefMatchesWorld(isTrue, state) ? "le sait" : "se trompe";
}

/** The four choices one character's line offers, in the order they are read. */
export const STANCE_CHOICES = ["", ...CANON_FACT_BELIEF_STATES] as const;

/** What the author reads above the *non précisé* option. */
export const STANCE_UNSET_LABEL = "non précisé";

/** The columns a *when* sentence is read off. */
export interface CanonFactWhen {
  readonly validity: CanonFactValidity;
  readonly validFromDay: number | null;
  readonly validFromLabel: string | null;
  readonly validUntilDay: number | null;
  readonly validUntilLabel: string | null;
}

function boundWording(label: string | null, day: number | null): string | null {
  if (label !== null) return label;
  if (day === null) return null;

  return day < 0 ? `${String(-day)} jours avant l'ouverture` : `le jour ${String(day)}`;
}

/**
 * `de` and `à` in front of a bound, contracted when the bound is a *le*.
 *
 * *Vrai jusqu'à le jour 12* is not French, and the author's own wording is
 * arbitrary prose — so the preposition is chosen from what actually follows it
 * rather than assumed.
 */
function withDe(wording: string): string {
  return wording.startsWith("le ") ? `du ${wording.slice(3)}` : `de ${wording}`;
}

function withA(wording: string): string {
  return wording.startsWith("le ") ? `au ${wording.slice(3)}` : `à ${wording}`;
}

/**
 * When a fact holds, in one French sentence.
 *
 * The author's own wording wins over the number whenever they gave one — the
 * number is what a checker reads, the words are what a novelist wrote, and a
 * card showing *le jour −3650* where the bible says *novembre 1998* would be
 * the data model surfacing through the screen.
 */
export function describeCanonFactWhen(fact: CanonFactWhen, endingEventName: string | null): string {
  if (fact.validity === "PERMANENT") return "Vrai d'un bout à l'autre du roman.";

  if (fact.validity === "UNTIL_EVENT") {
    return endingEventName === null
      ? "Vrai jusqu'à un événement de la chronologie."
      : `Vrai jusqu'à « ${endingEventName} ».`;
  }

  const from = boundWording(fact.validFromLabel, fact.validFromDay);
  const until = boundWording(fact.validUntilLabel, fact.validUntilDay);

  if (from !== null && until !== null) return `Vrai ${withDe(from)} ${withA(until)}.`;
  if (from !== null) return `Vrai à partir ${withDe(from)}.`;
  if (until !== null) return `Vrai jusqu'${withA(until)}.`;

  return "Vrai pendant une période.";
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The three filters, carried in the URL rather than in component state.
 *
 * Server-side, so the list narrows without JavaScript and a filtered view is a
 * link the author can keep. The bible screen's own search stays client-side for
 * the opposite reason: it searches six sections already rendered.
 */
export interface CanonFactFilters {
  /** A character the fact concerns, or whose stance it records. */
  readonly characterId: string | null;
  readonly validity: CanonFactValidity | null;
  readonly status: BibleCanonFactRow["status"] | null;
}

export const CANON_FACT_FILTER_KEYS = {
  character: "personnage",
  period: "periode",
  status: "statut",
} as const;

const VALIDITIES = new Set<string>(["PERMANENT", "DURING_PERIOD", "UNTIL_EVENT"]);
const STATUSES = new Set<string>(["PROPOSED", "CONFIRMED", "REJECTED"]);

function readParam(params: Record<string, string | string[] | undefined>, key: string): string | null {
  const value = params[key];

  return readText(Array.isArray(value) ? value[0] : value);
}

/**
 * Reads the three filters off the query string.
 *
 * A value outside its closed set is read as *no filter* rather than as an
 * error: a hand-edited URL narrowing to nothing would look like an empty bible,
 * which is the one answer this screen must never give by accident.
 */
export function readCanonFactFilters(
  params: Record<string, string | string[] | undefined>,
): CanonFactFilters {
  const validity = readParam(params, CANON_FACT_FILTER_KEYS.period);
  const status = readParam(params, CANON_FACT_FILTER_KEYS.status);

  return {
    characterId: readParam(params, CANON_FACT_FILTER_KEYS.character),
    validity: validity !== null && VALIDITIES.has(validity) ? (validity as CanonFactValidity) : null,
    status: status !== null && STATUSES.has(status) ? (status as BibleCanonFactRow["status"]) : null,
  };
}

/** Whether anything is being filtered at all — what the empty state reads. */
export function hasCanonFactFilter(filters: CanonFactFilters): boolean {
  return filters.characterId !== null || filters.validity !== null || filters.status !== null;
}

/** What one fact must carry for a filter to keep it. */
export interface FilterableCanonFact {
  readonly validity: CanonFactValidity;
  readonly status: BibleCanonFactRow["status"];
  /** Every character the fact concerns *or* records a stance for. */
  readonly characterIds: readonly string[];
}

/**
 * Whether one fact survives the three filters.
 *
 * A character filter matches a fact the character is a **subject** of and a
 * fact that records their **stance** — the two ways a fact bears on someone,
 * and separating them on screen would make *les faits de Nora* a question with
 * two answers.
 */
export function matchesCanonFactFilters(
  fact: FilterableCanonFact,
  filters: CanonFactFilters,
): boolean {
  if (filters.validity !== null && fact.validity !== filters.validity) return false;
  if (filters.status !== null && fact.status !== filters.status) return false;

  return filters.characterId === null || fact.characterIds.includes(filters.characterId);
}
