/**
 * What the author may make one direction say, by hand (CAL-085): rewriting a
 * proposed direction freely, or writing one entirely their own.
 *
 * **One schema, two write paths** — `packages/analysis/src/section-edit.ts`'s
 * arrangement, one epic later. A direction arrives either from
 * `propose-directions`, parsed whole by `directionProposalSchema` before
 * anything is persisted (§6), or from a person filling in the same twelve
 * attributes and the narrative engine on screen. Those two must be bound by
 * the same rules, so this does not restate them: it reaches into
 * `directionProposalSchema`'s own fields and reuses them untouched. A ceiling
 * raised there is raised here in the same diff.
 *
 * **`dimensionTreatments` is left out on purpose.** It is not a thirteenth
 * field a person fills in — `proposals.ts`'s own doc comment says the
 * declaration is "ahead of the `CreativeDirection` row" for *every* origin,
 * generated or written by hand: no row persists it today, so a user-written
 * direction is not a special case of that absence, it is simply one more row
 * that does not have one.
 *
 * **Nothing here decides how a resubmission compares to what stood before,
 * and nothing here names `DirectionOrigin`.** Whether content changed is the
 * repository's question — it is the one side holding both the current row and
 * the submission — and the origin transition is `@calepin/shared/repository`'s
 * own small restatement of CAL-073's rule 2, typed on `DirectionOrigin`
 * because that enum predates and diverges from `ContentOrigin`
 * (`PROPOSED` vs. `GENERATED`) the way `ChapterRevisionOrigin` and
 * `TargetLength` already do for the same reason (CAL-043).
 */

import { fail, fromValidationIssues, type Result, succeed } from "@calepin/shared/errors";
import { z } from "zod";

import { directionProposalSchema } from "./proposals";

/**
 * A direction's content, in the shape a person may submit: the twelve
 * attributes `directionProposalSchema` also carries, plus the narrative
 * engine declaration, minus `dimensionTreatments` — see this module's doc
 * comment. Every field is the *same schema object* `directionProposalSchema`
 * declares, not a second derivation of its bounds.
 */
export const directionContentSchema = z.strictObject({
  workingTitle: directionProposalSchema.shape.workingTitle,
  developedPremise: directionProposalSchema.shape.developedPremise,
  dominantGenre: directionProposalSchema.shape.dominantGenre,
  mainConflict: directionProposalSchema.shape.mainConflict,
  protagonistArc: directionProposalSchema.shape.protagonistArc,
  newStakes: directionProposalSchema.shape.newStakes,
  charactersToIntroduce: directionProposalSchema.shape.charactersToIntroduce,
  endingNature: directionProposalSchema.shape.endingNature,
  mainRisks: directionProposalSchema.shape.mainRisks,
  elementsKeptFromSource: directionProposalSchema.shape.elementsKeptFromSource,
  elementsTransformed: directionProposalSchema.shape.elementsTransformed,
  novelPotentialAssessment: directionProposalSchema.shape.novelPotentialAssessment,
  narrativeEngine: directionProposalSchema.shape.narrativeEngine,
});

export type DirectionContent = z.infer<typeof directionContentSchema>;

/**
 * Parses a direction a person wrote or rewrote, or refuses it with a French
 * sentence.
 *
 * A `Result` rather than a throw (§7): a title past its ceiling, a list under
 * its minimum, or a narrative-engine axis that names no member is a failure
 * the form has to show the author, not a bug. The sentence names the rule and
 * never quotes what was typed; `fieldPath` is the first issue's path and
 * never its value (§9) — `fromValidationIssues` guarantees the second half by
 * declaring no `message` field to copy a validator's own into.
 */
export function parseDirectionContent(submitted: unknown): Result<DirectionContent> {
  const parsed = directionContentSchema.safeParse(submitted);

  if (!parsed.success) {
    return fail(fromValidationIssues(parsed.error, { userMessage: refusalMessage(parsed.error) }));
  }

  return succeed(parsed.data);
}

/**
 * One French sentence, chosen from the *kind* of the first issue and never
 * from its value — the four remedies `section-edit.ts`'s own refusal message
 * distinguishes, applied to a direction's shape instead of a section's.
 */
function refusalMessage(error: z.ZodError): string {
  const issue = error.issues[0];

  if (issue === undefined) return GENERIC_REFUSAL;

  if (issue.code === "too_small") {
    return issue.origin === "array"
      ? "Cette liste doit compter au moins autant d'éléments que le demande cette direction."
      : "Un champ obligatoire de cette direction est vide.";
  }

  if (issue.code === "too_big") {
    return issue.origin === "array"
      ? "Cette liste ne peut pas compter autant d'éléments pour cette direction."
      : "Un des textes saisis est trop long pour ce champ.";
  }

  if (issue.path.at(0) === "narrativeEngine") {
    return "Le moteur narratif comporte une valeur non reconnue sur l'un de ses axes.";
  }

  return GENERIC_REFUSAL;
}

const GENERIC_REFUSAL = "Cette direction n'a pas pu être enregistrée telle quelle.";
