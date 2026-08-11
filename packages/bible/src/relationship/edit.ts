/**
 * What the author may make one tie say, by hand (CAL-091).
 *
 * **One schema, two write paths** — `packages/direction/src/edit.ts`'s
 * arrangement, one epic later. An edge arrives either from
 * `relate-characters`, parsed whole by `characterRelationsSchema` before
 * anything is persisted (§6), or from a person filling the same fields on
 * screen. Those two are bound by the same rules, so nothing is restated here:
 * it reaches into `directedRelationshipSchema`'s own fields and reuses them
 * untouched. A ceiling raised there is raised here in the same diff.
 *
 * **Three fields, because the table has three columns.** `fromCharacterName`
 * and `toCharacterName` are absent: the ends of an edge are not content a
 * person retypes — they are chosen from the cast on screen and travel as ids,
 * and moving an edge to another pair is a different edge, not an edit of this
 * one. `asymmetries` is absent too, and that boundary is worth stating
 * plainly: `Relationship` holds one `description`, and the structured,
 * checkable home of *who knows what* is `CanonFact` + `CanonFactBelief`
 * (CAL-094, CAL-098) — which is what `Relationship.description`'s own doc
 * comment says, and what `resolveRelationshipAsymmetries` already produces for
 * the generated path. A hand-authored asymmetry is therefore written as prose
 * in the description today and declared as canon in CAL-098; inventing a
 * fourth column here would be a second place for the same truth to live.
 *
 * What a *pair* amounts to stays derived either way (`./graph`), so a tie the
 * author writes by hand is classified `one-sided` or `divergent` on the same
 * evidence as a generated one, with nothing to keep in step.
 */

import { fail, fromValidationIssues, type Result, succeed } from "@calepin/shared/errors";
import { z } from "zod";

import { CHARACTER_LABEL_CHAR_CEILING } from "../character/schema";
import { directedRelationshipSchema, RELATIONSHIP_CHAR_CEILINGS } from "./schema";

/**
 * One tie's content, in the shape a person may submit — the three columns
 * `Relationship` stores beyond its two foreign keys. Every field is the *same
 * schema object* `directedRelationshipSchema` declares, not a second
 * derivation of its bounds.
 */
export const relationshipContentSchema = z.strictObject({
  type: directedRelationshipSchema.shape.type,
  label: directedRelationshipSchema.shape.label,
  description: directedRelationshipSchema.shape.description,
});

export type RelationshipContent = z.infer<typeof relationshipContentSchema>;

const GENERIC_REFUSAL = "Ce lien ne peut pas être enregistré tel quel.";

/**
 * Parses a tie a person wrote or rewrote, or refuses it with a French
 * sentence.
 *
 * A `Result` rather than a throw (§7): a label past its ceiling or a type that
 * names no member is a failure the form has to show the author, not a bug. The
 * sentence names the rule and never quotes what was typed; `fieldPath` is the
 * first issue's path and never its value (§9).
 */
export function parseRelationshipContent(submitted: unknown): Result<RelationshipContent> {
  const parsed = relationshipContentSchema.safeParse(submitted);

  if (!parsed.success) {
    return fail(fromValidationIssues(parsed.error, { userMessage: refusalMessage(parsed.error) }));
  }

  return succeed(parsed.data);
}

/**
 * One French sentence, chosen from the *kind* of the first issue and never
 * from its value — `parseDirectionContent`'s own arrangement.
 */
function refusalMessage(error: z.ZodError): string {
  const issue = error.issues[0];

  if (issue === undefined) return GENERIC_REFUSAL;

  if (issue.code === "invalid_value" || issue.code === "invalid_type") {
    return "Choisissez un type de lien dans la liste proposée.";
  }

  if (issue.code === "too_small") {
    return "Le libellé du lien ne peut pas être vide.";
  }

  if (issue.code === "too_big") {
    return issue.path.includes("label")
      ? `Le libellé du lien ne peut pas dépasser ${String(CHARACTER_LABEL_CHAR_CEILING)} caractères.`
      : `Ce que ce personnage tient de l'autre ne peut pas dépasser ${String(RELATIONSHIP_CHAR_CEILINGS.description)} caractères.`;
  }

  return GENERIC_REFUSAL;
}
