/**
 * What the author may make one sheet say, by hand (CAL-097).
 *
 * `relationship/edit.ts`'s arrangement, one model over: sixteen fields
 * rather than three, because `Character` stores sixteen own-row columns —
 * the seventeenth, `relationships`, is `Relationship` rows and is edited
 * through `relationship/edit.ts` instead.
 *
 * **The three paired fields are edited as the one flattened string already
 * stored.** `deepNeed`, `contradiction` and `speechStyle` leave
 * `create-character-sheet` as `{ need, divergence }` and its two siblings,
 * but `resolveCharacterSheet` (`./resolve`) joins each pair with its own
 * connector before the row is ever written — the column holds one text, and
 * a hand edit rewrites that one text. Re-splitting it back into a pair here
 * would invent a parse of prose nothing asks for; ceilings below are still
 * derived from the two word targets the pair started from
 * (`CHARACTER_WORD_TARGETS`), so a hand-written replacement stays the same
 * order of length as a generated one.
 *
 * **Every field but the name may be cleared.** `Character`'s own schema
 * comment says it: *"the sheet is filled progressively and CAL-097 saves as
 * the author types."* An empty submission is `null`, never refused —
 * `parseCharacterContent` reduces it before validation runs, so the schema
 * itself only ever sees a non-empty string or `null`. The two lists
 * (`heldKnowledge`, `elementsToPreserve`) follow the same rule and may run
 * empty, unlike the generation floor of one (`CHARACTER_LIST_COUNTS`): that
 * floor is a narrative rule for a sheet a model must hand over complete, not
 * a constraint on a sheet a person is still filling in.
 *
 * **No basis, no verification.** A hand edit is not a claim to check against
 * a corpus (`character/schema.ts`'s "no basis, deliberately" carries over
 * unchanged); the only guard here is form and length.
 */

import { fail, fromValidationIssues, type Result, succeed } from "@calepin/shared/errors";
import { z } from "zod";

import { ceilingFor } from "../identity/schema";
import {
  CHARACTER_CHAR_CEILINGS,
  CHARACTER_IMPORTANCES,
  CHARACTER_LABEL_CHAR_CEILING,
  CHARACTER_LIST_COUNTS,
  CHARACTER_WORD_TARGETS,
} from "./schema";

/**
 * The ceilings for the three fields a sheet stores flattened — the sum of
 * the pair's own two word targets, `ceilingFor`'s formula applied once more
 * rather than restated (CAL-055: one number per concept, wherever it
 * appears).
 */
export const CHARACTER_EDIT_CHAR_CEILINGS = {
  deepNeed: ceilingFor(CHARACTER_WORD_TARGETS.need + CHARACTER_WORD_TARGETS.divergence),
  contradiction: ceilingFor(CHARACTER_WORD_TARGETS.tension + CHARACTER_WORD_TARGETS.dilemma),
  speechStyle: ceilingFor(CHARACTER_WORD_TARGETS.voice + CHARACTER_WORD_TARGETS.breach),
} as const;

/** How many lines the two hand-edited lists carry — see the header. */
export const CHARACTER_EDIT_LIST_MAX = {
  heldKnowledge: CHARACTER_LIST_COUNTS.heldKnowledge.max,
  elementsToPreserve: CHARACTER_LIST_COUNTS.elementsToPreserve.max,
} as const;

function proseField(ceiling: number): z.ZodNullable<z.ZodString> {
  return z.string().trim().min(1).max(ceiling).nullable();
}

/**
 * The sixteen own-row fields, as a person may submit them. Every nullable
 * field has already had an empty submission reduced to `null` by
 * `parseCharacterContent` before this schema ever sees it.
 */
export const characterContentSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(CHARACTER_LABEL_CHAR_CEILING),
    age: z.int().nullable(),
    role: z.string().trim().min(1).max(CHARACTER_LABEL_CHAR_CEILING).nullable(),
    importance: z.enum(CHARACTER_IMPORTANCES),
    appearance: proseField(CHARACTER_CHAR_CEILINGS.appearance),
    initialSituation: proseField(CHARACTER_CHAR_CEILINGS.initialSituation),
    apparentDesire: proseField(CHARACTER_CHAR_CEILINGS.apparentDesire),
    deepNeed: proseField(CHARACTER_EDIT_CHAR_CEILINGS.deepNeed),
    fear: proseField(CHARACTER_CHAR_CEILINGS.fear),
    contradiction: proseField(CHARACTER_EDIT_CHAR_CEILINGS.contradiction),
    secret: proseField(CHARACTER_CHAR_CEILINGS.secret),
    past: proseField(CHARACTER_CHAR_CEILINGS.past),
    plannedArc: proseField(CHARACTER_CHAR_CEILINGS.plannedArc),
    speechStyle: proseField(CHARACTER_EDIT_CHAR_CEILINGS.speechStyle),
    heldKnowledge: z
      .array(z.string().trim().min(1).max(CHARACTER_CHAR_CEILINGS.knowledge))
      .max(CHARACTER_EDIT_LIST_MAX.heldKnowledge),
    elementsToPreserve: z
      .array(z.string().trim().min(1).max(CHARACTER_CHAR_CEILINGS.preserve))
      .max(CHARACTER_EDIT_LIST_MAX.elementsToPreserve),
  })
  .check((ctx) => {
    // The lower bound as a `.check`, `conflictedCharacterSheetSchema`'s own
    // move against the same `minimum` JSON Schema keyword — no structured
    // output reads this contract, but the two ages stay one rule rather than
    // two, wherever `age` is declared.
    if (ctx.value.age !== null && ctx.value.age < 0) {
      ctx.issues.push({
        code: "custom",
        message: "a character's age cannot be negative",
        path: ["age"],
        input: ctx.value,
      });
    }
  });

export type CharacterContent = z.infer<typeof characterContentSchema>;

const NULLABLE_STRING_FIELDS = [
  "role",
  "appearance",
  "initialSituation",
  "apparentDesire",
  "deepNeed",
  "fear",
  "contradiction",
  "secret",
  "past",
  "plannedArc",
  "speechStyle",
] as const;

const LIST_FIELDS = ["heldKnowledge", "elementsToPreserve"] as const;

function emptyToNull(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

/**
 * Reduces a raw submission before `characterContentSchema` ever parses it: an
 * empty string becomes `null` on every nullable field, and an empty or
 * whitespace-only line is dropped from the two lists. The schema then only
 * ever has to refuse form and length, never decide what "cleared" looks like.
 */
function reduceSubmission(submitted: unknown): unknown {
  if (typeof submitted !== "object" || submitted === null || Array.isArray(submitted)) {
    return submitted;
  }

  const record = submitted as Record<string, unknown>;
  const reduced: Record<string, unknown> = { ...record };

  for (const field of NULLABLE_STRING_FIELDS) {
    reduced[field] = emptyToNull(record[field]);
  }

  for (const field of LIST_FIELDS) {
    const value = record[field];
    if (Array.isArray(value)) {
      reduced[field] = value.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim() !== "",
      );
    }
  }

  return reduced;
}

const GENERIC_REFUSAL = "Cette fiche ne peut pas être enregistrée telle quelle.";

/**
 * Parses a sheet a person wrote or rewrote, or refuses it with a French
 * sentence — `parseRelationshipContent`'s shape. The sentence names the rule
 * and never quotes what was typed; `fieldPath` is the first issue's path and
 * never its value (§9).
 */
export function parseCharacterContent(submitted: unknown): Result<CharacterContent> {
  const parsed = characterContentSchema.safeParse(reduceSubmission(submitted));

  if (!parsed.success) {
    return fail(fromValidationIssues(parsed.error, { userMessage: refusalMessage(parsed.error) }));
  }

  return succeed(parsed.data);
}

/**
 * One French sentence, chosen from the *kind* of the first issue and never
 * from its value — `parseRelationshipContent`'s own arrangement.
 */
function refusalMessage(error: z.ZodError): string {
  const issue = error.issues[0];

  if (issue === undefined) return GENERIC_REFUSAL;

  if (issue.path[0] === "name") {
    return "Le nom du personnage ne peut pas être vide.";
  }

  if (issue.path[0] === "age") {
    return "L'âge doit être un nombre entier positif, ou laissé vide.";
  }

  if (issue.path[0] === "importance") {
    return "Choisissez une importance dans la liste proposée.";
  }

  if (issue.code === "too_big") {
    return "Ce texte dépasse la longueur autorisée pour ce champ.";
  }

  return GENERIC_REFUSAL;
}
