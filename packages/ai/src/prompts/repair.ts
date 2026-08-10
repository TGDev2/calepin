/**
 * `repair-structured-output` — the pipeline's own re-ask, as a versioned
 * resource (CAL-052, lifted here by CAL-053).
 *
 * The only prompt that serves no mission and every mission: it is appended to
 * whichever mission prompt was just rejected, when the answer *attempted* the
 * contract and missed it. `repair.ts` in the layer above decides whether an
 * answer is worth this pass; this file is only the wording of the pass.
 *
 * **The derived prompt keeps the mission prompt's identity.** The repair is
 * still the mission's pass, and `GenerationAttempt` has one `promptVersion`
 * column: recording this resource's version there would attribute the answer to
 * the wrong prompt. So `deriveRepairPrompt` appends the text and leaves
 * `promptId`, `version` and `missionId` where they were.
 *
 * **The clause table below is part of version 1 of this resource.** It is the
 * other half of what the model reads, so changing what a violation reads as is
 * a change to the prompt, and it ships as a new version beside this one — not
 * as an edit to `violationClause`.
 *
 * **The clauses are built from issue codes, never from issue messages.** A
 * validator's message is the one place a received *value* can appear, and
 * `@calepin/shared/errors` already refuses that bridge in writing. An
 * expectation assembled from the issue's own structural fields — the expected
 * type, the bound, the schema's options, the keys to drop — cannot carry one by
 * accident.
 *
 * **It is French**, like the mission prompt it is appended to: the fields it
 * asks the model to correct hold French narrative content, and an English
 * instruction inside a French prompt moves the answer's language.
 */

import { toFieldPath } from "@calepin/shared/errors";
import type { z } from "zod";

import { renderPrompt } from "./render";
import type { MissionPrompt, PromptDefinition } from "./types";

/** Clauses quoted back to the model. A wholly wrong answer cannot inflate the prompt. */
const MAX_REPAIR_CLAUSES = 10;

const V1 = {
  id: "repair-structured-output",
  version: 1,
  scope: { kind: "pipeline" },
  variables: [
    {
      name: "rejectedAnswer",
      type: "text",
      description: "The answer that failed validation, serialised as JSON.",
    },
    {
      name: "violations",
      type: "list",
      description: "One clause per contract violation, built from the issue's structural fields.",
    },
  ],
  // Empty, and it has to be: a pipeline prompt is appended to a mission prompt
  // and never replaces its permanent instructions.
  system: "",
  instruction: [
    "---",
    "",
    "La réponse précédente a été rejetée : elle ne respecte pas le schéma JSON demandé.",
    "",
    "Réponse rejetée :",
    "```json",
    "{{rejectedAnswer}}",
    "```",
    "",
    "Points à corriger :",
    "{{violations}}",
    "",
    "Renvoie l'objet JSON complet et corrigé, conforme au schéma. Conserve le contenu déjà correct ; ne corrige que ce qui est signalé ci-dessus. Ne renvoie rien d'autre que cet objet : ni explication, ni commentaire, ni texte avant ou après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const REPAIR_STRUCTURED_OUTPUT_PROMPTS = [V1] as const;

/**
 * The targeted re-ask: the original request, the rejected answer, and one line
 * per violation.
 *
 * **The rejected answer travels back.** A provider call is stateless — system
 * and prompt, no conversation — so a model asked to "fix the fields below" has
 * nothing to fix unless it is shown what it produced. Without it this would be
 * a re-ask wearing a repair's name, which is the blind retry §6 rules out.
 */
export function deriveRepairPrompt(options: {
  readonly original: MissionPrompt;
  readonly value: unknown;
  readonly issues: readonly z.core.$ZodIssue[];
}): MissionPrompt {
  const repair = renderPrompt(V1, {
    // `undefined` is the one value `JSON.stringify` answers with nothing at all,
    // and it is exactly what a body that would not parse leaves behind.
    rejectedAnswer: JSON.stringify(options.value) ?? "null",
    violations: options.issues.slice(0, MAX_REPAIR_CLAUSES).map(violationClause),
  });

  return { ...options.original, text: `${options.original.text}\n\n${repair.text}` };
}

function violationClause(issue: z.core.$ZodIssue): string {
  const path = toFieldPath(issue.path);
  const expectation = expectationOf(issue);

  return path === undefined ? expectation : `${path} : ${expectation}`;
}

/**
 * What the schema wanted there, in the model's language.
 *
 * Every branch reads a field the *schema* put on the issue, so nothing the
 * model produced can travel through here — except `unrecognized_keys`, whose
 * `keys` are key names the model invented and which are precisely what it has
 * to be told to drop.
 */
function expectationOf(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return `type attendu « ${issue.expected} » — champ absent, vide ou d'un autre type`;
    case "invalid_value":
      return `valeur attendue parmi ${quoteAll(issue.values)}`;
    case "too_small":
      return `minimum attendu : ${issue.minimum}`;
    case "too_big":
      return `maximum attendu : ${issue.maximum}`;
    case "invalid_format":
      return `format attendu « ${issue.format} »`;
    case "not_multiple_of":
      return `multiple de ${issue.divisor} attendu`;
    case "unrecognized_keys":
      return `clés non prévues par le schéma, à retirer : ${quoteAll(issue.keys)}`;
    case "invalid_union":
      return "aucune des formes prévues par le schéma n'est respectée";
    case "invalid_key":
    case "invalid_element":
      return "clé ou élément non conforme au schéma";
    default:
      // `custom` and anything a later Zod adds. A refinement's own message is
      // deliberately not quoted: it is the one clause a domain could write
      // around the value that failed.
      return "contrainte du schéma non satisfaite";
  }
}

function quoteAll(values: readonly unknown[]): string {
  return values.map((value) => `« ${String(value)} »`).join(", ");
}
