/**
 * What the author may make one canonical fact say, by hand (CAL-098).
 *
 * **One schema, two write paths** — the arrangement `parseAnalysisSectionEdit`,
 * `parseDirectionContent` and `parseRelationshipContent` already established.
 * A fact arrives either from `extract-initial-facts`, parsed whole by
 * `initialCanonFactsSchema` before anything is persisted (§6), or from a person
 * filling the same three dimensions on screen. The ceilings and the vocabulary
 * are reached into rather than restated: `CANON_FACT_CHAR_CEILINGS`,
 * `CANON_FACT_BELIEF_STATES`, `CANON_FACT_VALIDITIES`, `TIMELINE_PRECISIONS`.
 *
 * **This schema mirrors the four SQL CHECKs, and that is its job.**
 * `canon_facts_validity_check`, the two precision-pairing checks and
 * `canon_facts_period_order_check` all sit on the table; without a mirror here
 * a plausible submission would come back as a Postgres constraint name — a
 * refusal nobody can act on and a message §7 forbids showing. The database
 * stays the authority; this is the French translation of what it will accept.
 *
 * **Two deliberate divergences from the mission's contract**, both because a
 * person is not a model:
 *
 * 1. A bound may be **words alone**. `canonFactBoundSchema` requires the day,
 *    the precision and the wording together, because a fact CAL-093 cannot
 *    place is a fact the canon cannot defend. An author writing *depuis
 *    l'accident de novembre 1998* does not hold the day offset, and demanding
 *    one would make the specification's own third example unwritable. The
 *    column already allows it (`num_nonnulls(...) >= 1` over four columns, the
 *    two labels included), the loss is legible — `factInForceOn` answers `null`
 *    rather than a wrong `true` — and the screen says so.
 * 2. Both lists may run **empty**. The mission asks for at least one subject
 *    and one stance because an extraction that found neither found nothing;
 *    a fact typed into a bible still being filled owes neither. This is
 *    `parseCharacterContent`'s own reading of a floor as a generation-time
 *    demand.
 *
 * **An absent stance is not `UNAWARE`.** `CanonFactBelief`'s doc comment draws
 * that line and warns against conflating the two: a row means the author has
 * decided, and an explicit *ignore* is canon a generation must respect, while
 * no row constrains nothing. So a character the form says nothing about
 * carries no entry here — never an implied member.
 *
 * Atomicity is deliberately **not** enforced. `checkCanonFactStatement` is a
 * report and never a `Result`; the mission drops on a finding and this path
 * shows it, which is what the glossary's own entry says of CAL-098. A detector
 * that under-fires by design must not be the thing that refuses a save.
 */

import { fail, fromValidationIssues, type Result, succeed } from "@calepin/shared/errors";
import { z } from "zod";

import { TIMELINE_DAY_BOUND, TIMELINE_PRECISIONS } from "../timeline/schema";
import { CANON_FACT_CHAR_CEILINGS } from "./schema";
import { CANON_FACT_BELIEF_STATES, CANON_FACT_VALIDITIES } from "./types";

/** The identifier of a row this project owns, resolved by the repository. */
const rowId = z.string().trim().min(1).max(64);

/**
 * One end of a period, as a person may state it: a wording, a day, or both.
 *
 * The pairing rule is `canon_facts_valid_from_precision_check`'s and its twin's
 * — a day with no precision would be read as day-precise by every consumer, so
 * the two move together or neither is set. An entry saying nothing at all is
 * refused here rather than stored as a bound that bounds nothing.
 */
export const canonFactBoundInputSchema = z
  .strictObject({
    /** Days from the day the novel opens, negative before it. */
    day: z.int().nullable(),
    precision: z.enum(TIMELINE_PRECISIONS).nullable(),
    /** The author's own wording: *l'hiver qui suit l'accident*. */
    label: z.string().trim().min(1).max(CANON_FACT_CHAR_CEILINGS.boundLabel).nullable(),
  })
  .check((ctx) => {
    const bound = ctx.value;

    const refuse = (message: string, path: string): void => {
      ctx.issues.push({ code: "custom", message, path: [path], input: ctx.value });
    };

    if ((bound.day === null) !== (bound.precision === null)) {
      refuse("a day and how exactly it is known are set together, or neither is", "precision");
    }

    if (bound.day === null && bound.label === null) {
      refuse("a bound states a day or a wording", "label");
    }

    if (bound.day !== null && Math.abs(bound.day) > TIMELINE_DAY_BOUND) {
      refuse("a bound sits further from the opening than the axis reaches", "day");
    }
  });

export type CanonFactBoundInput = z.infer<typeof canonFactBoundInputSchema>;

/** One character's stance on the statement — one `CanonFactBelief` row. */
export const canonFactBeliefInputSchema = z.strictObject({
  characterId: rowId,
  state: z.enum(CANON_FACT_BELIEF_STATES),
});

export type CanonFactBeliefInput = z.infer<typeof canonFactBeliefInputSchema>;

/**
 * What one fact is about — one `CanonFactSubject` row.
 *
 * The kind is carried rather than inferred from which id is set, because the
 * row's own `canon_fact_subjects_exactly_one_check` is a statement about
 * exclusivity and an object with two nullable ids is exactly the shape that can
 * break it. One kind, one id, and the repository writes the column the kind
 * names — §6's *never trust a caller with a column* applied to a form.
 */
export const canonFactSubjectInputSchema = z.strictObject({
  kind: z.enum(["character", "place"]),
  id: rowId,
});

export type CanonFactSubjectInput = z.infer<typeof canonFactSubjectInputSchema>;

/** How many stances and subjects one hand-written fact may carry. */
export const CANON_FACT_EDIT_LIST_CEILINGS = {
  beliefs: 200,
  subjects: 50,
} as const;

/**
 * One fact's content, in the shape a person may submit — every column
 * `CanonFact` stores except the three the code decides (`source`, `status` and
 * the audit block), plus the two child tables.
 */
export const canonFactContentSchema = z
  .strictObject({
    /** One assertion, affirmative. Its polarity lives in `isTrue`. */
    statement: z.string().trim().min(1).max(CANON_FACT_CHAR_CEILINGS.statement),
    /** Its truth in the world of the novel, never in anyone's mind. */
    isTrue: z.boolean(),
    validity: z.enum(CANON_FACT_VALIDITIES),
    validFrom: canonFactBoundInputSchema.nullable(),
    validUntil: canonFactBoundInputSchema.nullable(),
    /** The timeline event that ends it — resolved to a row by the repository. */
    invalidatedByEventId: rowId.nullable(),
    beliefs: z.array(canonFactBeliefInputSchema).max(CANON_FACT_EDIT_LIST_CEILINGS.beliefs),
    subjects: z.array(canonFactSubjectInputSchema).max(CANON_FACT_EDIT_LIST_CEILINGS.subjects),
  })
  .check((ctx) => {
    const fact = ctx.value;

    const refuse = (message: string, path: string): void => {
      ctx.issues.push({ code: "custom", message, path: [path], input: ctx.value });
    };

    // canon_facts_validity_check, branch by branch.
    if (fact.validity === "PERMANENT") {
      if (fact.validFrom !== null || fact.validUntil !== null) {
        refuse("a permanent fact carries no bound", "validity");
      }
      if (fact.invalidatedByEventId !== null) {
        refuse("a permanent fact is ended by no event", "invalidatedByEventId");
      }
    }

    if (fact.validity === "DURING_PERIOD") {
      if (fact.validFrom === null && fact.validUntil === null) {
        refuse("a fact true during a period carries at least one bound", "validFrom");
      }
      if (fact.invalidatedByEventId !== null) {
        refuse("a fact true during a period is ended by no event", "invalidatedByEventId");
      }
      // canon_facts_period_order_check — equal days are a fact true one day.
      const from = fact.validFrom?.day ?? null;
      const until = fact.validUntil?.day ?? null;
      if (from !== null && until !== null && from > until) {
        refuse("a period ends before it begins", "validUntil");
      }
    }

    if (fact.validity === "UNTIL_EVENT") {
      if (fact.invalidatedByEventId === null) {
        refuse("a fact false after an event names that event", "invalidatedByEventId");
      }
      if (fact.validFrom !== null || fact.validUntil !== null) {
        refuse("a fact placed by an event carries no bound of its own", "validFrom");
      }
    }

    // @@unique([factId, characterId]) — one stance per character per fact.
    const characters = new Set<string>();
    for (const belief of fact.beliefs) {
      if (characters.has(belief.characterId)) {
        refuse("one character holds one stance on one fact", "beliefs");
        break;
      }
      characters.add(belief.characterId);
    }

    // The two partial unique indexes on canon_fact_subjects.
    const subjects = new Set<string>();
    for (const subject of fact.subjects) {
      const key = `${subject.kind}:${subject.id}`;
      if (subjects.has(key)) {
        refuse("a fact names each of its subjects once", "subjects");
        break;
      }
      subjects.add(key);
    }
  });

export type CanonFactContent = z.infer<typeof canonFactContentSchema>;

const GENERIC_REFUSAL = "Ce fait ne peut pas être enregistré tel quel.";

/**
 * The French sentence a refusal becomes, chosen from the *kind* and *path* of
 * the first issue and never from what was typed (§9).
 *
 * Every sentence names the rule and the remedy, in the vocabulary the screen
 * uses — never a column, never an enum member. `parseDirectionContent`'s own
 * arrangement.
 */
const CUSTOM_REFUSALS: Readonly<Record<string, string>> = {
  validity: "Une portée temporelle et ses bornes ne s'accordent pas : revoyez le bloc « Quand ».",
  invalidatedByEventId:
    "Choisissez l'événement à partir duquel ce fait cesse d'être vrai, et lui seul.",
  validFrom: "Indiquez au moins un repère — depuis quand, ou jusqu'à quand.",
  validUntil: "La fin de la période tombe avant son début.",
  precision: "Quand vous donnez un jour, indiquez aussi à quel point il est connu.",
  label: "Un repère doit dire quelque chose : une date, ou vos propres mots.",
  day: "Ce repère est trop loin de l'ouverture du roman.",
  beliefs: "Un personnage ne peut tenir qu'une seule position sur un même fait.",
  subjects: "Ce fait ne peut désigner deux fois le même personnage ou le même lieu.",
};

function refusalMessage(error: z.ZodError): string {
  const issue = error.issues[0];

  if (issue === undefined) return GENERIC_REFUSAL;

  if (issue.code === "custom") {
    const field = issue.path.at(-1);

    return (typeof field === "string" ? CUSTOM_REFUSALS[field] : undefined) ?? GENERIC_REFUSAL;
  }

  if (issue.code === "too_small") {
    return issue.path.includes("statement")
      ? "Écrivez ce qui est vrai dans le roman : le fait ne peut pas être vide."
      : GENERIC_REFUSAL;
  }

  if (issue.code === "too_big") {
    return issue.path.includes("statement")
      ? `Un fait tient en ${String(CANON_FACT_CHAR_CEILINGS.statement)} caractères : coupez-le en plusieurs faits.`
      : `Un repère ne peut pas dépasser ${String(CANON_FACT_CHAR_CEILINGS.boundLabel)} caractères.`;
  }

  return GENERIC_REFUSAL;
}

/**
 * Parses a fact a person wrote or rewrote, or refuses it with a French
 * sentence.
 *
 * A `Result` rather than a throw (§7): a period that ends before it begins is a
 * failure the form has to show the author, not a bug. The sentence names the
 * rule and never quotes what was typed; `fieldPath` is the first issue's path
 * and never its value (§9).
 */
export function parseCanonFactContent(submitted: unknown): Result<CanonFactContent> {
  const parsed = canonFactContentSchema.safeParse(submitted);

  if (!parsed.success) {
    return fail(fromValidationIssues(parsed.error, { userMessage: refusalMessage(parsed.error) }));
  }

  return succeed(parsed.data);
}
